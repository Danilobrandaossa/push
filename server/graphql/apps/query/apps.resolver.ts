import { desc } from 'drizzle-orm'
import { defineQuery } from 'nitro-graphql/utils/define'
import { decryptSensitiveData, isDataEncrypted } from '~~/server/utils/crypto'

export const appsQuery = defineQuery({
  apps: {
    resolve: async (_parent, args, { context }) => {
      try {
        const { useDatabase, tables } = context
        const db = useDatabase()

        console.log('[Apps Query] Fetching apps from database')
        const apps = await db
          .select()
          .from(tables.app)
          .orderBy(desc(tables.app.createdAt))

        console.log(`[Apps Query] Found ${apps.length} app(s) in database`)

        // Decrypt sensitive fields for each app
        const decryptedApps = apps.map((app) => {
          const decryptedApp = { ...app }

          try {
            if (decryptedApp.vapidPrivateKey && isDataEncrypted(decryptedApp.vapidPrivateKey)) {
              if (process.env.ENCRYPTION_KEY) {
                decryptedApp.vapidPrivateKey = decryptSensitiveData(decryptedApp.vapidPrivateKey)
              } else {
                // No ENCRYPTION_KEY - assume key is unencrypted despite format
                console.warn('[Apps Query] ENCRYPTION_KEY not set - using VAPID key as-is')
              }
            }

            if (decryptedApp.apnsPrivateKey && isDataEncrypted(decryptedApp.apnsPrivateKey)) {
              if (process.env.ENCRYPTION_KEY) {
                decryptedApp.apnsPrivateKey = decryptSensitiveData(decryptedApp.apnsPrivateKey)
              } else {
                console.warn('[Apps Query] ENCRYPTION_KEY not set - using APNS key as-is')
              }
            }

            // fcmServerKey decryption is handled by field resolver for fcmServiceAccount
          }
          catch (decryptError) {
            console.error('[Apps Query] Error decrypting app data:', decryptError)
            // Continue with encrypted data if decryption fails
          }

          return decryptedApp
        })

        console.log(`[Apps Query] Returning ${decryptedApps.length} app(s)`)
        return decryptedApps
      }
      catch (error) {
        console.error('[Apps Query] Error fetching apps:', error)
        throw error
      }
    },
  },
})
