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
              decryptedApp.vapidPrivateKey = decryptSensitiveData(decryptedApp.vapidPrivateKey)
            }

            if (decryptedApp.apnsPrivateKey && isDataEncrypted(decryptedApp.apnsPrivateKey)) {
              decryptedApp.apnsPrivateKey = decryptSensitiveData(decryptedApp.apnsPrivateKey)
            }

            if (decryptedApp.fcmServiceAccount && isDataEncrypted(decryptedApp.fcmServiceAccount)) {
              decryptedApp.fcmServiceAccount = decryptSensitiveData(decryptedApp.fcmServiceAccount)
            }
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
