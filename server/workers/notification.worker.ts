import type { Job } from 'bullmq'
import type { ProcessScheduledJobData, RetryNotificationJobData, SendNotificationJobData } from '../queues/notification.queue'
import { Worker } from 'bullmq'
import { and, eq, sql } from 'drizzle-orm'
import { getDatabase } from '../database/connection'
import { deliveryLog, notification } from '../database/schema'
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
    // Para Web Push: icon é o ícone da notificação, image é imagem grande
    const notificationPayload = {
      title: payload.title,
      body: payload.body,
      data: payload.data,
      badge: payload.badge,
      sound: payload.sound,
      clickAction: payload.clickAction,
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

    // Create delivery log (use onConflictDoUpdate to handle duplicates)
    try {
      await db
        .insert(deliveryLog)
        .values({
          notificationId,
          deviceId,
          status: result.success ? 'SENT' : 'FAILED',
          errorMessage: result.error,
          providerResponse: { messageId: result.messageId },
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
              providerResponse: { messageId: result.messageId },
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

    // Update notification statistics
    if (result.success) {
      await db.execute(`
        UPDATE notification
        SET "totalSent" = "totalSent" + 1,
            "updatedAt" = NOW()
        WHERE id = '${notificationId}'
      `)
    }
    else {
      await db.execute(`
        UPDATE notification
        SET "totalFailed" = "totalFailed" + 1,
            "updatedAt" = NOW()
        WHERE id = '${notificationId}'
      `)

      // Queue for retry if not max attempts
      if (job.attemptsMade < MAX_RETRY_ATTEMPTS) {
        await addRetryNotificationJob({
          ...job.data,
          attemptCount: job.attemptsMade + 1,
          lastError: result.error,
        })
      }
    }

    return { success: result.success, messageId: result.messageId }
  }
  catch (error) {
    console.error(`[NotificationWorker] Error processing job ${job.id}:`, error)

    // Create failed delivery log (use onConflictDoUpdate to handle duplicates)
    try {
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
            status: sql`excluded.status`,
            errorMessage: sql`excluded."errorMessage"`,
            updatedAt: new Date().toISOString(),
          },
        })
    } catch (logError: any) {
      // Handle different types of errors
      const errorCode = logError?.code || logError?.constraint_name
      
      // 23505 = duplicate key (already handled by onConflictDoUpdate, but just in case)
      if (errorCode === '23505' || logError?.message?.includes('duplicate key')) {
        console.warn(`[NotificationWorker] Delivery log already exists for error, updating: ${notificationId}/${deviceId}`)
        try {
          await db
            .update(deliveryLog)
            .set({
              status: 'FAILED',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              updatedAt: new Date().toISOString(),
            })
            .where(and(
              eq(deliveryLog.notificationId, notificationId),
              eq(deliveryLog.deviceId, deviceId)
            ))
        } catch (updateError) {
          console.error(`[NotificationWorker] Failed to update delivery log for error: ${updateError}`)
        }
      }
      // 23503 = foreign key constraint violation (device was deleted)
      else if (errorCode === '23503' || logError?.message?.includes('foreign key constraint')) {
        console.warn(`[NotificationWorker] Device ${deviceId} no longer exists, skipping delivery log creation for error`)
        // Device was deleted, can't create delivery log - this is OK, just log and continue
      }
      else {
        // Log but don't throw - we don't want to fail the job processing because of log insertion failure
        console.error(`[NotificationWorker] Failed to insert delivery log for error: ${logError}`)
      }
    }

    // Update failed count
    await db.execute(`
      UPDATE notification
      SET "totalFailed" = "totalFailed" + 1,
          "updatedAt" = NOW()
      WHERE id = '${notificationId}'
    `)

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
      connection: getRedisConnection(),
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
