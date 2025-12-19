import { and, eq } from 'drizzle-orm'
import { defineMutation } from 'nitro-graphql/utils/define'
import { encryptSensitiveData, decryptSensitiveData, isDataEncrypted } from '~~/server/utils/crypto'
import { createError } from 'h3'

export const configureWebPushMutation = defineMutation({
  configureWebPush: {
    resolve: async (_parent, { id, input }, { context }) => {
      try {
        const { useDatabase, tables } = context
        const db = useDatabase()

        // Check if app exists
        const app = await db
          .select()
          .from(tables.app)
          .where(eq(tables.app.id, id))
          .limit(1)

        if (app.length === 0) {
          throw createError({
            statusCode: 404,
            message: 'App not found',
          })
        }

        // Validate subject format
        if (!input.subject.startsWith('mailto:') && !input.subject.startsWith('https://')) {
          throw createError({
            statusCode: 400,
            message: 'Subject must be a mailto: email or https: URL',
          })
        }

        // Validate keys are not empty
        if (!input.publicKey || !input.privateKey) {
          throw createError({
            statusCode: 400,
            message: 'Public key and private key are required',
          })
        }

        // Normalize keys (remove all whitespace)
        const normalizedPublicKey = input.publicKey.replace(/\s+/g, '')
        const normalizedPrivateKey = input.privateKey.replace(/\s+/g, '')

        // Check if VAPID keys are changing
        const oldPublicKey = app[0]?.vapidPublicKey?.replace(/\s+/g, '') || null
        const keysAreChanging = oldPublicKey && oldPublicKey !== normalizedPublicKey

        console.log('[configureWebPush] Normalizing VAPID keys:', {
          appId: id,
          publicKeyOriginalLength: input.publicKey.length,
          publicKeyNormalizedLength: normalizedPublicKey.length,
          wasPublicKeyNormalized: normalizedPublicKey !== input.publicKey,
          privateKeyOriginalLength: input.privateKey.length,
          privateKeyNormalizedLength: normalizedPrivateKey.length,
          wasPrivateKeyNormalized: normalizedPrivateKey !== input.privateKey,
          publicKeyPreview: normalizedPublicKey.substring(0, 30) + '...',
          privateKeyPreview: normalizedPrivateKey.substring(0, 30) + '...',
          keysAreChanging: keysAreChanging,
          oldPublicKeyPreview: oldPublicKey ? oldPublicKey.substring(0, 30) + '...' : 'none'
        })

        // Encrypt sensitive private key before storing
        const encryptedPrivateKey = encryptSensitiveData(normalizedPrivateKey)

        // Update app with Web Push configuration
        const updatedApp = await db
          .update(tables.app)
          .set({
            vapidSubject: input.subject,
            vapidPublicKey: normalizedPublicKey,
            vapidPrivateKey: encryptedPrivateKey,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(tables.app.id, id))
          .returning()

        // CRITICAL: If VAPID keys changed, invalidate all existing WEB devices
        // This is necessary because subscriptions are bound to the key pair used during creation
        // Old subscriptions will fail with 403 if we try to send with new keys
        if (keysAreChanging) {
          console.warn('[configureWebPush] ⚠️ VAPID keys are changing - invalidating all existing WEB devices')
          console.warn('[configureWebPush] ⚠️ Old subscriptions were created with different keys and will fail with 403')
          console.warn('[configureWebPush] ⚠️ Marking all WEB devices as EXPIRED to force re-subscription with new keys')

          const expiredDevices = await db
            .update(tables.device)
            .set({
              status: 'EXPIRED',
              updatedAt: new Date().toISOString(),
            })
            .where(
              and(
                eq(tables.device.appId, id),
                eq(tables.device.platform, 'WEB')
              )
            )
            .returning()

          console.log(`[configureWebPush] ✅ Marked ${expiredDevices.length} WEB devices as EXPIRED`)
          console.log(`[configureWebPush] ✅ These devices will need to create new subscriptions with the updated VAPID keys`)
        }

        if (!updatedApp[0]) {
          throw createError({
            statusCode: 500,
            message: 'Failed to update app configuration',
          })
        }

        // Decrypt private key for response (so frontend can display it)
        const result = { ...updatedApp[0] }
        if (result.vapidPrivateKey && isDataEncrypted(result.vapidPrivateKey)) {
          result.vapidPrivateKey = decryptSensitiveData(result.vapidPrivateKey)
        }

        return result
      }
      catch (error) {
        // Re-throw createError instances
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error
        }

        // Log unexpected errors
        console.error('[configureWebPush] Unexpected error:', error)

        // Return a generic error
        throw createError({
          statusCode: 500,
          message: error instanceof Error ? error.message : 'Unexpected error.',
        })
      }
    },
  },
})
