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

function isValidRedisUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // URL must have hostname (not empty)
    return !!(parsed.hostname && parsed.hostname !== '')
  }
  catch {
    return false
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

    // If REDIS_URL is provided and valid, use it directly (ioredis supports URL format)
    if (redisUrl && isValidRedisUrl(redisUrl)) {
      redisInstance = new Redis(redisUrl, baseConfig)
    }
    else {
      // Fallback to individual env vars
      const host = process.env.REDIS_HOST || 'localhost'
      const port = Number.parseInt(process.env.REDIS_PORT || '6379')
      const password = process.env.REDIS_PASSWORD || undefined

      if (redisUrl && !isValidRedisUrl(redisUrl)) {
        console.warn('[Redis] REDIS_URL is invalid or incomplete, using REDIS_HOST/REDIS_PORT instead')
        // Try to extract password from invalid URL if possible
        const passwordMatch = redisUrl.match(/:[^:@]+@/)
        if (passwordMatch && !password) {
          const extractedPassword = passwordMatch[0].slice(1, -1)
          if (extractedPassword) {
            console.log('[Redis] Extracted password from REDIS_URL')
            redisInstance = new Redis({
              ...baseConfig,
              host,
              port,
              password: extractedPassword,
            })
          }
        }
      }

      if (!redisInstance) {
        redisInstance = new Redis({
          ...baseConfig,
          host,
          port,
          password,
        })
      }
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

  // BullMQ supports both URL string and connection object
  // Prefer URL if available as it's more reliable
  if (redisUrl) {
    // Validate URL format
    if (isValidRedisUrl(redisUrl)) {
      try {
        const parsed = new URL(redisUrl)
        // URL is valid, log connection info (without password) for debugging
        const safeUrl = `redis://${parsed.username || 'default'}@${parsed.hostname}:${parsed.port || '6379'}`
        console.log(`[Redis] Using REDIS_URL: ${safeUrl}`)
        return redisUrl
      }
      catch (error) {
        console.error('[Redis] Error parsing REDIS_URL:', error instanceof Error ? error.message : 'Unknown error')
        // Fall through to use individual env vars
      }
    }
    else {
      // URL is invalid or incomplete
      console.error('[Redis] REDIS_URL is invalid or incomplete')
      console.error('[Redis] Expected format: redis://[username]:[password]@[host]:[port]')
      const safeUrl = redisUrl.replace(/:[^:@]+@/, ':****@')
      console.error(`[Redis] Current value: ${safeUrl}`)

      // Try to extract password and username from incomplete URL
      const passwordMatch = redisUrl.match(/:[^:@]+@/)
      const usernameMatch = redisUrl.match(/^redis:\/\/([^:]+):/)

      if (passwordMatch || usernameMatch) {
        const extractedPassword = passwordMatch ? passwordMatch[0].slice(1, -1) : undefined
        const extractedUsername = usernameMatch ? usernameMatch[1] : undefined

        // Use extracted values if individual env vars are not set
        const host = process.env.REDIS_HOST || 'localhost'
        const port = Number.parseInt(process.env.REDIS_PORT || '6379')
        const password = process.env.REDIS_PASSWORD || extractedPassword

        if (extractedPassword) {
          console.log('[Redis] Extracted password from REDIS_URL, using connection object')
        }

        return {
          host,
          port,
          password,
          maxRetriesPerRequest: null,
        }
      }
      // Fall through to use individual env vars
    }
  }

  // Fallback to connection object
  const host = process.env.REDIS_HOST || 'localhost'
  const port = Number.parseInt(process.env.REDIS_PORT || '6379')
  const password = process.env.REDIS_PASSWORD || undefined
  console.log(`[Redis] Using connection object: ${host}:${port}${password ? ' (with password)' : ''}`)
  return {
    host,
    port,
    password,
    maxRetriesPerRequest: null,
  }
}

export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    await redisInstance.quit()
    redisInstance = null
  }
}
