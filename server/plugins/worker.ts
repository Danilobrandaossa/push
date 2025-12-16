import { startNotificationWorker, stopNotificationWorker } from '../workers/notification.worker'

export default defineNitroPlugin((nitroApp) => {
  // Only start worker if not in test environment
  if (process.env.NODE_ENV === 'test') {
    console.log('[WorkerPlugin] Skipping worker in test environment')
    return
  }

  // Skip worker if Redis is disabled
  if (process.env.REDIS_ENABLED === 'false') {
    console.log('[WorkerPlugin] Worker disabled (REDIS_ENABLED=false)')
    return
  }

  // Start the notification worker
  try {
    const worker = startNotificationWorker()
    if (worker) {
      console.log('[WorkerPlugin] Notification worker started')
    }
    else {
      console.warn('[WorkerPlugin] Notification worker not started (Redis unavailable). Set REDIS_ENABLED=false to suppress this warning.')
    }
  }
  catch (error) {
    console.error('[WorkerPlugin] Failed to start notification worker:', error)
  }

  // Handle graceful shutdown
  nitroApp.hooks.hook('close', async () => {
    console.log('[WorkerPlugin] Shutting down worker...')
    await stopNotificationWorker()
  })
})
