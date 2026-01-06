import { Queue } from 'bullmq'
import { getRedisConnection } from '../utils/redis'
import type { NotificationPayload } from '../utils/validation'

export interface SendNotificationJobData {
  notificationId: string
  deviceId: string
  appId: string
  platform: 'ios' | 'android' | 'web'
  token: string
  webPushP256dh?: string
  webPushAuth?: string
  payload: NotificationPayload
}

export interface RetryNotificationJobData {
  notificationId: string
  deviceId: string
  appId: string
  platform: 'ios' | 'android' | 'web'
  token: string
  webPushP256dh?: string
  webPushAuth?: string
  payload: NotificationPayload
  attemptCount: number
  lastError?: string
}

export interface ProcessScheduledJobData {
  notificationId: string
}

let notificationQueue: Queue<SendNotificationJobData | RetryNotificationJobData | ProcessScheduledJobData> | null = null

export function getNotificationQueue() {
  if (!notificationQueue) {
    try {
      notificationQueue = new Queue('notifications', {
        connection: getRedisConnection() as any,
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 60000, // Start with 1 minute, then 2, 4, 8, 16 minutes
          },
          removeOnComplete: {
            count: 1000, // Keep last 1000 completed jobs
            age: 24 * 3600, // Keep for 24 hours
          },
          removeOnFail: {
            count: 5000, // Keep last 5000 failed jobs
            age: 7 * 24 * 3600, // Keep for 7 days
          },
        },
      })

      notificationQueue.on('error', (err) => {
        // Only log non-connection errors to avoid spam
        if (!err.message?.includes('ECONNREFUSED') && !err.message?.includes('connect')) {
          console.error('[NotificationQueue] Queue error:', err.message)
        }
      })
    }
    catch (error: any) {
      // If Redis is not available, log warning
      if (error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
        console.warn('[NotificationQueue] Redis not available, queue operations will fail. Set REDIS_ENABLED=false to disable.')
      }
      throw error
    }
  }
  return notificationQueue
}

export async function addSendNotificationJob(data: SendNotificationJobData) {
  try {
    const queue = getNotificationQueue()
    return await queue.add('send-notification', data, {
      priority: 1,
    })
  }
  catch (error: any) {
    // If Redis is not available, log warning but don't crash
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
      console.warn('[NotificationQueue] Redis not available, job not queued. Notification will be sent synchronously.')
      return null
    }
    throw error
  }
}

export async function addRetryNotificationJob(data: RetryNotificationJobData) {
  try {
    const queue = getNotificationQueue()
    return await queue.add('retry-notification', data, {
      priority: 2,
      delay: 2 ** data.attemptCount * 60000, // Exponential backoff
    })
  }
  catch (error: any) {
    // If Redis is not available, log warning but don't crash
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
      console.warn('[NotificationQueue] Redis not available, retry job not queued.')
      return null
    }
    throw error
  }
}

export async function addProcessScheduledJob(data: ProcessScheduledJobData, runAt: Date) {
  try {
    const queue = getNotificationQueue()
    const delay = Math.max(0, runAt.getTime() - Date.now())
    return await queue.add('process-scheduled', data, {
      delay,
      priority: 3,
    })
  }
  catch (error: any) {
    // If Redis is not available, log warning but don't crash
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('connect')) {
      console.warn('[NotificationQueue] Redis not available, scheduled job not queued.')
      return null
    }
    throw error
  }
}

export async function closeNotificationQueue() {
  if (notificationQueue) {
    await notificationQueue.close()
    notificationQueue = null
  }
}
