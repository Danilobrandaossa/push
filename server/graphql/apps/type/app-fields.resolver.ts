import { and, eq, gte, sql } from 'drizzle-orm'
import { defineField } from 'nitro-graphql/utils/define'
import { decryptSensitiveData, isDataEncrypted } from '~~/server/utils/crypto'

// Cache para avisos de descriptografia FCM (evita spam de logs)
const fcmDecryptWarningCache = new Map<string, number>()
const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutos

export const appFieldsResolver = defineField({
  App: {
    // Map fcmServiceAccount to fcmServerKey from database and decrypt if needed
    fcmServiceAccount: {
      resolve: (parent: any) => {
        // The database field is fcmServerKey, but GraphQL schema uses fcmServiceAccount
        const fcmServerKey = parent.fcmServerKey
        if (!fcmServerKey) {
          return null
        }

        // Decrypt if encrypted
        try {
          if (isDataEncrypted(fcmServerKey)) {
            if (process.env.ENCRYPTION_KEY) {
              try {
                return decryptSensitiveData(fcmServerKey)
              } catch (decryptError) {
                // If decryption fails, log warning once per app and return null instead of breaking the query
                // Use a simple cache to avoid logging the same error repeatedly
                const appId = parent.id
                const cacheKey = `fcm_decrypt_error_${appId}`
                const now = Date.now()
                const cachedTime = fcmDecryptWarningCache.get(cacheKey)

                if (!cachedTime || (now - cachedTime) > CACHE_DURATION_MS) {
                  const errorMsg = decryptError instanceof Error ? decryptError.message : 'Unknown error'
                  console.warn(`[App fcmServiceAccount Field] Failed to decrypt FCM service account for app ${appId}:`, errorMsg)
                  console.warn('[App fcmServiceAccount Field] This may happen if ENCRYPTION_KEY changed or data is corrupted')
                  console.warn('[App fcmServiceAccount Field] Returning null - FCM service account will need to be reconfigured')
                  console.warn('[App fcmServiceAccount Field] (This warning will only appear once per app every 5 minutes)')
                  // Cache the warning timestamp
                  fcmDecryptWarningCache.set(cacheKey, now)

                  // Clean up old cache entries periodically
                  if (fcmDecryptWarningCache.size > 100) {
                    for (const [key, timestamp] of fcmDecryptWarningCache.entries()) {
                      if ((now - timestamp) > CACHE_DURATION_MS) {
                        fcmDecryptWarningCache.delete(key)
                      }
                    }
                  }
                }
                return null // Return null instead of encrypted value to avoid breaking queries
              }
            } else {
              // No ENCRYPTION_KEY - assume key is unencrypted despite format
              console.warn('[App fcmServiceAccount Field] ENCRYPTION_KEY not set - returning FCM key as-is')
              return fcmServerKey
            }
          }
          return fcmServerKey
        } catch (error) {
          // Catch any other unexpected errors
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'
          console.error('[App fcmServiceAccount Field] Unexpected error:', errorMsg)
          return null // Return null to prevent breaking the GraphQL query
        }
      },
    },

    devices: {
      resolve: async (parent, _args, { context }) => {
        const { dataloaders } = context
        return await dataloaders.devicesByAppLoader.load(parent.id)
      },
    },

    notifications: {
      resolve: async (parent, _args, { context }) => {
        const { dataloaders } = context
        return await dataloaders.notificationsByAppLoader.load(parent.id)
      },
    },

    apiKeys: {
      resolve: async (parent, _args, { context }) => {
        const { dataloaders } = context
        return await dataloaders.apiKeysByAppLoader.load(parent.id)
      },
    },

    stats: {
      resolve: async (parent, _args, { context }) => {
        try {
          const { useDatabase, tables } = context
          const db = useDatabase()

          const today = new Date()
          today.setHours(0, 0, 0, 0)

          // Get total devices
          const totalDevicesResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(tables.device)
            .where(eq(tables.device.appId, parent.id))

          // Get active devices
          const activeDevicesResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(tables.device)
            .where(
              and(
                eq(tables.device.appId, parent.id),
                eq(tables.device.status, 'ACTIVE'),
              ),
            )

          // Get new devices today
          const newDevicesTodayResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(tables.device)
            .where(
              and(
                eq(tables.device.appId, parent.id),
                gte(tables.device.createdAt, today.toISOString()),
              ),
            )

          // Get sent notifications today
          const sentTodayResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(tables.notification)
            .where(
              and(
                eq(tables.notification.appId, parent.id),
                gte(tables.notification.sentAt, today.toISOString()),
              ),
            )

          // Get delivery stats for rate calculation
          const deliveryStatsResult = await db
            .select({
              totalTargets: sql<number>`sum(${tables.notification.totalTargets})`,
              totalDelivered: sql<number>`sum(${tables.notification.totalDelivered})`,
            })
            .from(tables.notification)
            .where(eq(tables.notification.appId, parent.id))

          const totalTargets = deliveryStatsResult[0]?.totalTargets || 0
          const totalDelivered = deliveryStatsResult[0]?.totalDelivered || 0
          const deliveryRate = totalTargets > 0 ? (totalDelivered / totalTargets) * 100 : 0

          return {
            totalDevices: Number(totalDevicesResult[0]?.count) || 0,
            activeDevices: Number(activeDevicesResult[0]?.count) || 0,
            newDevicesToday: Number(newDevicesTodayResult[0]?.count) || 0,
            sentToday: Number(sentTodayResult[0]?.count) || 0,
            deliveryRate,
            apiCalls: 0, // TODO: Implement API call tracking
          }
        } catch (error) {
          console.error('[AppStats Field Resolver] Error resolving stats:', error)
          console.error('[AppStats Field Resolver] Error stack:', error instanceof Error ? error.stack : 'No stack')
          throw error
        }
      },
    },
  },
})
