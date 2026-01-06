import type { Job } from 'bullmq'
import type { ProcessScheduledJobData, RetryNotificationJobData, SendNotificationJobData } from '../queues/notification.queue'
import { Worker } from 'bullmq'
import { and, eq, sql } from 'drizzle-orm'
import { getDatabase } from '../database/connection'
import { deliveryLog, notification, device } from '../database/schema'
import { getProviderForApp } from '../providers'
import { addRetryNotificationJob } from '../queues/notification.queue'
import { getRedisConnection } from '../utils/redis'

const MAX_RETRY_ATTEMPTS = 5

async function processSendNotification(job: Job<SendNotificationJobData>) {
  const { notificationId, deviceId, appId, platform, token, webPushP256dh, webPushAuth, payload } = job.data
  const db = getDatabase()

  try {
    const provider = await getProviderForApp(appId, platform)

    // Build notification payload
    // Wrap click action with tracking URL if configured
    let clickAction = payload.clickAction
    if (clickAction && process.env.APP_URL) {
      // Ensure APP_URL doesn't end with slash
      const baseUrl = process.env.APP_URL.endsWith('/') ? process.env.APP_URL.slice(0, -1) : process.env.APP_URL
      const encodedUrl = encodeURIComponent(clickAction)
      clickAction = `${baseUrl}/api/tracking/click?u=${encodedUrl}&n=${notificationId}&d=${deviceId}`
    }

    // Para Web Push: icon é o ícone da notificação, image é imagem grande
    const notificationPayload = {
      title: payload.title,
      body: payload.body,
      data: payload.data,
      badge: payload.badge,
      sound: payload.sound,
      clickAction,
      icon: payload.icon || payload.imageUrl || undefined, // Usar icon primeiro, fallback para imageUrl
      image: payload.image || payload.imageUrl || undefined, // image é para imagem grande
      imageUrl: payload.imageUrl || undefined, // Manter para compatibilidade
    }

    // Build message based on platform
    let message
    if (platform === 'web') {
      if (!webPushP256dh || !webPushAuth) {
        throw new Error('WebPush subscription keys missing')
      }
      message = (provider as any).convertNotificationPayload(notificationPayload, {
        endpoint: token,
        keys: {
          p256dh: webPushP256dh,
          auth: webPushAuth,
        },
      })
    }
    else {
      message = (provider as any).convertNotificationPayload(
        notificationPayload,
        token,
        notificationId,
        deviceId,
      )
    }

    const result = await (provider as any).sendMessage(message)

    // Check previous status for correct stats accounting
    // We need to suppress the type error here because db.query might not be correctly inferred in the worker file context
    // @ts-ignore
    const existingLog = await db.query.deliveryLog.findFirst({
      where: and(
        eq(deliveryLog.notificationId, notificationId),
        eq(deliveryLog.deviceId, deviceId)
      )
    })

    const previousStatus = existingLog?.status

    // Create delivery log (use onConflictDoUpdate to handle duplicates)
    try {
      await db
        .insert(deliveryLog)
        .values({
          notificationId,
          deviceId,
          status: result.success ? 'SENT' : 'FAILED',
          errorMessage: result.error,
          providerResponse: {
            messageId: result.messageId,
            statusCode: (result as any).statusCode
          },
          sentAt: result.success ? new Date().toISOString() : null,
        })
        .onConflictDoUpdate({
          target: [deliveryLog.notificationId, deliveryLog.deviceId],
          set: {
            status: sql`excluded.status`,
            errorMessage: sql`excluded."errorMessage"`,
            providerResponse: sql`excluded."providerResponse"`,
            sentAt: sql`excluded."sentAt"`,
            updatedAt: new Date().toISOString(),
          },
        })
    } catch (logError: any) {
      // Handle different types of errors
      const errorCode = logError?.code || logError?.constraint_name

      // 23505 = duplicate key (already handled by onConflictDoUpdate, but just in case)
      if (errorCode === '23505' || logError?.message?.includes('duplicate key')) {
        console.warn(`[NotificationWorker] Delivery log already exists, updating: ${notificationId}/${deviceId}`)
        try {
          await db
            .update(deliveryLog)
            .set({
              status: result.success ? 'SENT' : 'FAILED',
              errorMessage: result.error,
              providerResponse: {
                messageId: result.messageId,
                statusCode: (result as any).statusCode
              },
              sentAt: result.success ? new Date().toISOString() : null,
              updatedAt: new Date().toISOString(),
            })
            .where(and(
              eq(deliveryLog.notificationId, notificationId),
              eq(deliveryLog.deviceId, deviceId)
            ))
        } catch (updateError) {
          console.error(`[NotificationWorker] Failed to update delivery log: ${updateError}`)
        }
      }
      // 23503 = foreign key constraint violation (device was deleted)
      else if (errorCode === '23503' || logError?.message?.includes('foreign key constraint')) {
        console.warn(`[NotificationWorker] Device ${deviceId} no longer exists, skipping delivery log creation`)
        // Device was deleted, can't create delivery log - this is OK, just log and continue
      }
      else {
        // Re-throw if it's a different error
        throw logError
      }
    }

    // Update notification statistics carefully
    if (result.success) {
      if (previousStatus === 'FAILED') {
        // Recovered from failure
        await db.execute(sql`
          UPDATE notification
          SET "totalSent" = "totalSent" + 1,
              "totalDelivered" = "totalDelivered" + 1,
              "totalFailed" = GREATEST("totalFailed" - 1, 0),
              "updatedAt" = NOW()
          WHERE id = ${notificationId}
        `)
      } else if (!previousStatus) {
        // First attempt success
        await db.execute(sql`
          UPDATE notification
          SET "totalSent" = "totalSent" + 1,
              "totalDelivered" = "totalDelivered" + 1,
              "updatedAt" = NOW()
          WHERE id = ${notificationId}
        `)
      }
    }
    else {
      // Handle Failure
      const statusCode = (result as any).statusCode

      // Check for permanent failure to inactivate device
      // - HTTP 404 (Not Found) or 410 (Gone) -> Invalid Token
      // - FCM errors: UNREGISTERED, NOT_FOUND
      // - APNs errors: NotRegistered, InvalidRegistration  
      // - WebPush VAPID errors: credentials mismatch (device registered with different VAPID keys)
      const isPermanentFailure =
        statusCode === 404 ||
        statusCode === 410 ||
        result.error?.includes('NotRegistered') ||
        result.error?.includes('InvalidRegistration') ||
        result.error?.includes('UNREGISTERED') ||
        result.error?.includes('NOT_FOUND') ||
        result.error?.includes('VAPID credentials') ||
        result.error?.includes('do not correspond')

      if (isPermanentFailure) {
        console.log(`[NotificationWorker] Device ${deviceId} is invalid (${statusCode || result.error}), marking as INACTIVE`)
        await db.execute(sql`
           UPDATE device
           SET status = 'INACTIVE',
               "updatedAt" = NOW()
           WHERE id = ${deviceId}
         `)
      }

      if (previousStatus === 'SENT') {
        // Previously sent, now failed
        await db.execute(sql`
          UPDATE notification
          SET "totalSent" = GREATEST("totalSent" - 1, 0),
              "totalDelivered" = GREATEST("totalDelivered" - 1, 0),
              "totalFailed" = "totalFailed" + 1,
              "updatedAt" = NOW()
          WHERE id = ${notificationId}
        `)
      } else if (!previousStatus) {
        // First attempt fail
        await db.execute(sql`
          UPDATE notification
          SET "totalFailed" = "totalFailed" + 1,
              "updatedAt" = NOW()
          WHERE id = ${notificationId}
        `)
      }

      // Use attemptCount from data if available (for manual retries), otherwise use job.attemptsMade
      // This fixes the infinite loop where manual retries reset attemptsMade to 0
      const currentAttempt = (job.data as any).attemptCount || job.attemptsMade

      // Queue for retry if not max attempts AND error is not permanent
      if (currentAttempt < MAX_RETRY_ATTEMPTS && statusCode !== 410 && statusCode !== 404) {
        await addRetryNotificationJob({
          ...job.data,
          attemptCount: currentAttempt + 1,
          lastError: result.error,
        })
      }
    }

    return { success: result.success, messageId: result.messageId }
  }
  catch (error) {
    console.error(`[NotificationWorker] Error processing job ${job.id}:`, error)

    // Check if we already have a failure logged for this device/notification to avoid double counting attempts
    // We can check the result of the insert/update above, or query strictly.
    // Since we just updated the log to FAILED, we need to know if it WAS failed before.
    // But we lost that context if we didn't fetch it earlier. 
    // However, we can use a conditional update on the notification table using the deliveryLog count? No that's expensive.

    // Better approach: Only increment if this is the FIRST time we are logging a failure for this specific execution context?
    // No, retries are new executions.

    // Let's try to infer from the error context or just be safe and NOT increment if it's a retry and we don't know the status?
    // But then we miss counting the first failure if it ends up in catch block.

    // Safest fix: 
    // 1. Fetch the log BEFORE the update in catch block (if we didn't have previousStatus).
    // Note: 'previousStatus' variable from the try block is accessible here in the catch block! 
    // It is defined in the outer scope of the try block if we lift it? 
    // It was defined as `const previousStatus` inside try. I need to move it up.

    // Since I can't easily move it up with replace_file_content without replacing the whole function, 
    // I will use a direct SQL approach that is idempotent:
    // "Update totalFailed only if we haven't counted this device as failed yet?"
    // That's hard to track on the notification table (it just has a counter).

    // Alternative: 
    // Don't update stats in the catch block blindly. 
    // Instead, rely on a "Reconciliation" or "Aggregation" query? No, too slow.

    // Best effort with current architecture:
    // If 'previousStatus' is available (moved up), use it.
    // I will use 'sed' logic in my head: I can't access previousStatus if it's inside try.

    // So, I will perform a check here:
    // "Select status from deliveryLog where notificationId=... and deviceId=..."
    // If status was ALREADY 'FAILED' before our update (wait, we just updated it!), we can't know.

    // Correction: I should check the log BEFORE updating it in the catch block.

    // @ts-ignore
    const validPreviousStatus = await db.query.deliveryLog.findFirst({
      where: and(
        eq(deliveryLog.notificationId, notificationId),
        eq(deliveryLog.deviceId, deviceId)
      ),
      columns: { status: true }
    }).then((log: any) => log?.status).catch(() => undefined)

    // Create/Update failed delivery log
    try {
      // ... log update code ...
      await db
        .insert(deliveryLog)
        .values({
          notificationId,
          deviceId,
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          sentAt: null,
        })
        .onConflictDoUpdate({
          target: [deliveryLog.notificationId, deliveryLog.deviceId],
          set: {
            status: 'FAILED', // Explicit string since sql`excluded.status` refers to the VALUES which is 'FAILED'
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            updatedAt: new Date().toISOString(),
          },
        })
    } catch (logError: any) {
      // ... handled ...
      console.error(`[NotificationWorker] Failed to insert delivery log for error: ${logError}`)
    }

    // Update failed count only if it wasn't already failed
    if (validPreviousStatus !== 'FAILED') {
      const updateSet: any = {
        totalFailed: sql`"totalFailed" + 1`,
        updatedAt: new Date().toISOString(),
      }

      // If it was SENT before, we need to decrement sent/delivered
      if (validPreviousStatus === 'SENT' || validPreviousStatus === 'DELIVERED') {
        updateSet.totalSent = sql`GREATEST("totalSent" - 1, 0)`
        updateSet.totalDelivered = sql`GREATEST("totalDelivered" - 1, 0)`
      }

      await db
        .update(notification)
        .set(updateSet)
        .where(eq(notification.id, notificationId))
    }

    throw error
  }
}

async function processRetryNotification(job: Job<RetryNotificationJobData>) {
  // Same logic as send notification, just with retry context
  return processSendNotification(job as any)
}

async function processScheduledNotification(job: Job<ProcessScheduledJobData>) {
  const { notificationId } = job.data
  const db = getDatabase()

  try {
    // Get the notification
    const notificationResult = await db
      .select()
      .from(notification)
      .where(eq(notification.id, notificationId))
      .limit(1)

    if (notificationResult.length === 0) {
      console.log(`[NotificationWorker] Notification ${notificationId} not found, skipping`)
      return { success: false, reason: 'not_found' }
    }

    const notif = notificationResult[0]

    // Check if still scheduled (not cancelled)
    if (notif.status !== 'SCHEDULED') {
      console.log(`[NotificationWorker] Notification ${notificationId} is not scheduled (${notif.status}), skipping`)
      return { success: false, reason: 'not_scheduled' }
    }

    // Update status to PENDING and mark as being processed
    await db
      .update(notification)
      .set({ status: 'PENDING', updatedAt: new Date().toISOString() })
      .where(eq(notification.id, notificationId))

    console.log(`[NotificationWorker] Processing scheduled notification ${notificationId}`)

    // The actual sending will be handled by the sendNotification resolver
    // We just need to update the status here
    return { success: true, notificationId }
  }
  catch (error) {
    console.error(`[NotificationWorker] Error processing scheduled notification ${notificationId}:`, error)
    throw error
  }
}

let worker: Worker | null = null
let lastConnectionErrorTime = 0

export function startNotificationWorker() {
  if (worker) {
    console.log('[NotificationWorker] Worker already running')
    return worker
  }

  try {
    worker = new Worker(
      'notifications',
      async (job) => {
        console.log(`[NotificationWorker] Processing job ${job.id} (${job.name})`)

        switch (job.name) {
          case 'send-notification':
            return processSendNotification(job as Job<SendNotificationJobData>)
          case 'retry-notification':
            return processRetryNotification(job as Job<RetryNotificationJobData>)
          case 'process-scheduled':
            return processScheduledNotification(job as Job<ProcessScheduledJobData>)
          default:
            console.warn(`[NotificationWorker] Unknown job name: ${job.name}`)
            return { success: false, reason: 'unknown_job' }
        }
      },
      {
        connection: getRedisConnection() as any,
        concurrency: 10,
        limiter: {
          max: 100,
          duration: 1000, // Max 100 jobs per second
        },
      },
    )

    worker.on('completed', (job) => {
      console.log(`[NotificationWorker] Job ${job.id} completed`)
    })

    worker.on('failed', (job, err) => {
      console.error(`[NotificationWorker] Job ${job?.id} failed:`, err.message)
    })

    worker.on('error', (err) => {
      // Log connection errors with more context, but avoid spam
      if (err.message.includes('ECONNREFUSED') || err.message.includes('connect')) {
        // Only log once per minute to avoid spam
        const now = Date.now()
        if (now - lastConnectionErrorTime > 60000) {
          console.error('[NotificationWorker] Redis connection error:', err.message)
          console.error('[NotificationWorker] Check REDIS_URL or REDIS_HOST/REDIS_PORT configuration')
          lastConnectionErrorTime = now
        }
      }
      else {
        console.error('[NotificationWorker] Worker error:', err.message, err.stack)
      }
    })

    console.log('[NotificationWorker] Started')
    return worker
  }
  catch (error: any) {
    // If Redis is not available, log warning but don't crash
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
      console.warn('[NotificationWorker] Redis not available, worker will not start. Set REDIS_ENABLED=false to disable.')
      return null
    }
    throw error
  }
}

export async function stopNotificationWorker() {
  if (worker) {
    await worker.close()
    worker = null
    console.log('[NotificationWorker] Stopped')
  }
}
