import Redis from 'ioredis'

let redisInstance: Redis | null = null

function parseRedisUrl(url: string | undefined): { host: string; port: number; password?: string; username?: string } | null {
  if (!url)
    return null

  try {
    const parsed = new URL(url)
    return {
      host: parsed.hostname || 'localhost',
      port: parsed.port ? Number.parseInt(parsed.port) : 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined,
    }
  }
  catch {
    return null
  }
}

export function getRedis(): Redis {
  if (!redisInstance) {
    // Try REDIS_URL first, then fallback to individual env vars
    const redisUrl = process.env.REDIS_URL

    const baseConfig = {
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 10) {
          console.warn('[Redis] Max retries reached, giving up connection')
          return null // Stop retrying
        }
        return Math.min(times * 200, 2000) // Exponential backoff
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY'
        if (err.message.includes(targetError)) {
          return true
        }
        return false
      },
    }

    // If REDIS_URL is provided, use it directly (ioredis supports URL format)
    if (redisUrl) {
      redisInstance = new Redis(redisUrl, baseConfig)
    }
    else {
      // Fallback to individual env vars
      redisInstance = new Redis({
        ...baseConfig,
        host: process.env.REDIS_HOST || 'localhost',
        port: Number.parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      })
    }

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
  const redisUrl = process.env.REDIS_URL
  const parsedFromUrl = parseRedisUrl(redisUrl)

  if (redisUrl && parsedFromUrl) {
    return {
      host: parsedFromUrl.host,
      port: parsedFromUrl.port,
      password: parsedFromUrl.password,
      maxRetriesPerRequest: null,
    }
  }

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
