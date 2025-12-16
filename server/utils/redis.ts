import Redis from 'ioredis'

let redisInstance: Redis | null = null

export function getRedis(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number.parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 10) {
          console.warn('[Redis] Max retries reached, giving up connection')
          return null // Stop retrying
        }
        return Math.min(times * 200, 2000) // Exponential backoff
      },
      reconnectOnError: (err) => {
        const targetError = 'READONLY'
        if (err.message.includes(targetError)) {
          return true
        }
        return false
      },
    })

    redisInstance.on('error', (err) => {
      // Only log error if not a connection refused (expected when Redis is not available)
      if (!err.message.includes('ECONNREFUSED')) {
        console.error('[Redis] Connection error:', err.message)
      }
    })

    redisInstance.on('connect', () => {
      console.log('[Redis] Connected successfully')
    })

    redisInstance.on('ready', () => {
      console.log('[Redis] Ready')
    })
  }

  return redisInstance
}

export function getRedisConnection() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number.parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  }
}

export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit()
    redisInstance = null
  }
}
