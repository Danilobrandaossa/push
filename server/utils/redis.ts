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
  const redisHost = process.env.REDIS_HOST
  const redisPort = process.env.REDIS_PORT
  const redisPassword = process.env.REDIS_PASSWORD

  // If we have individual env vars, prefer them (more reliable for BullMQ)
  if (redisHost && redisPort) {
    const host = redisHost.trim()
    const port = Number.parseInt(redisPort)
    const password = redisPassword || undefined

    console.log(`[Redis] Using connection object from env vars: ${host}:${port}${password ? ' (with password)' : ''}`)
    return {
      host,
      port,
      password,
      maxRetriesPerRequest: null,
    }
  }

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

        // Return the URL - BullMQ will parse it
        return redisUrl
      }
      catch (error) {
        console.error('[Redis] Error parsing REDIS_URL:', error instanceof Error ? error.message : 'Unknown error')
        // Fall through to use individual env vars
      }
    }
    else {
      // URL is invalid or incomplete
      console.warn('[Redis] REDIS_URL is invalid or incomplete')
      console.warn('[Redis] Expected format: redis://[username]:[password]@[host]:[port]')
      const safeUrl = redisUrl.replace(/:[^:@]+@/, ':****@')
      console.warn(`[Redis] Current value: ${safeUrl}`)
      console.warn('[Redis] Falling back to REDIS_HOST/REDIS_PORT or localhost:6379')

      // Try to extract password and username from incomplete URL
      const passwordMatch = redisUrl.match(/:[^:@]+@/)
      const usernameMatch = redisUrl.match(/^redis:\/\/([^:]+):/)

      const extractedPassword = passwordMatch ? passwordMatch[0].slice(1, -1) : undefined

      // Use extracted values if individual env vars are not set
      let host = process.env.REDIS_HOST
      const port = Number.parseInt(process.env.REDIS_PORT || '6379')
      const password = process.env.REDIS_PASSWORD || extractedPassword

      // Validate and sanitize host
      if (!host || host === 'undefined' || host === '' || host.trim() === '') {
        console.error('[Redis] Host is undefined or empty. Cannot connect to Redis.')
        console.error('[Redis] Please set REDIS_HOST environment variable or provide a complete REDIS_URL')
        console.error('[Redis] Example: REDIS_URL=redis://default:password@host:6379')
        console.error('[Redis] Or: REDIS_HOST=your-redis-host REDIS_PORT=6379 REDIS_PASSWORD=your-password')
        // Return a connection object that will fail gracefully (but won't try to connect to undefined)
        return {
          host: 'localhost',
          port: 6379,
          password: undefined,
          maxRetriesPerRequest: null,
        }
      }

      host = host.trim()

      if (extractedPassword && !process.env.REDIS_PASSWORD) {
        console.log(`[Redis] Extracted password from REDIS_URL, using connection object: ${host}:${port}`)
      }
      else {
        console.log(`[Redis] Using connection object: ${host}:${port}${password ? ' (with password)' : ''}`)
      }

      return {
        host,
        port,
        password,
        maxRetriesPerRequest: null,
      }
    }
  }

  // Fallback to connection object
  let host = process.env.REDIS_HOST
  const port = Number.parseInt(process.env.REDIS_PORT || '6379')
  const password = process.env.REDIS_PASSWORD || undefined

  // Validate and sanitize host
  if (!host || host === 'undefined' || host === '' || host.trim() === '') {
    console.warn('[Redis] REDIS_HOST not set, using localhost as fallback')
    host = 'localhost'
  }
  else {
    host = host.trim()
  }

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
