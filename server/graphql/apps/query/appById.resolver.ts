import { eq } from 'drizzle-orm'
import { defineQuery } from 'nitro-graphql/utils/define'
import { decryptSensitiveData, isDataEncrypted } from '~~/server/utils/crypto'

export const appByIdQuery = defineQuery({
  app: {
    resolve: async (_parent, { id }, { context }) => {
      try {
        const { useDatabase, tables } = context
        const db = useDatabase()

        console.log('[AppById Query] Fetching app with id:', id)

        const result = await db
          .select()
          .from(tables.app)
          .where(eq(tables.app.id, id))
          .limit(1)

        if (!result[0]) {
          console.log('[AppById Query] App not found:', id)
          return null
        }

        const app = result[0]
        console.log('[AppById Query] App found:', app.id, app.name)

        // Decrypt sensitive fields if they are encrypted
        // Note: fcmServiceAccount is mapped from fcmServerKey via field resolver (handles decryption there)
        try {
          if (app.vapidPrivateKey && isDataEncrypted(app.vapidPrivateKey)) {
            if (process.env.ENCRYPTION_KEY) {
              app.vapidPrivateKey = decryptSensitiveData(app.vapidPrivateKey)
            } else {
              // No ENCRYPTION_KEY - assume key is unencrypted despite format
              console.warn('[AppById Query] ENCRYPTION_KEY not set - using VAPID key as-is')
            }
          }

          if (app.apnsPrivateKey && isDataEncrypted(app.apnsPrivateKey)) {
            if (process.env.ENCRYPTION_KEY) {
              app.apnsPrivateKey = decryptSensitiveData(app.apnsPrivateKey)
            } else {
              console.warn('[AppById Query] ENCRYPTION_KEY not set - using APNS key as-is')
            }
          }

          // fcmServerKey decryption is handled by field resolver for fcmServiceAccount
        } catch (decryptError) {
          console.error('[AppById Query] Error decrypting app data:', decryptError)
          // Continue with encrypted data if decryption fails
        }

        console.log('[AppById Query] Returning app:', app.id)
        return app
      } catch (error) {
        console.error('[AppById Query] Error fetching app:', error)
        console.error('[AppById Query] Error stack:', error instanceof Error ? error.stack : 'No stack')
        throw error
      }
    },
  },
})
