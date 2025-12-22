import { eq } from 'drizzle-orm'
import { defineMutation } from 'nitro-graphql/utils/define'
import { encryptSensitiveData } from '~~/server/utils/crypto'
import { createError } from 'h3'

export const configureAPNsMutation = defineMutation({
  configureAPNs: {
    resolve: async (_parent, { id, input }, { context }) => {
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

      // Encrypt sensitive private key before storing (if ENCRYPTION_KEY is available)
      let encryptedPrivateKey: string
      try {
        encryptedPrivateKey = encryptSensitiveData(input.privateKey)
      } catch (encryptError) {
        const errorMsg = encryptError instanceof Error ? encryptError.message : 'Unknown error'
        if (errorMsg.includes('ENCRYPTION_KEY')) {
          console.warn('[configureAPNs] ⚠️ ENCRYPTION_KEY not available - storing private key unencrypted (not recommended for production)')
          encryptedPrivateKey = input.privateKey // Store unencrypted
        } else {
          throw encryptError // Re-throw other encryption errors
        }
      }

      // Update app with APNs configuration
      const updatedApp = await db
        .update(tables.app)
        .set({
          apnsKeyId: input.keyId,
          apnsTeamId: input.teamId,
          apnsCertificate: encryptedPrivateKey,
          bundleId: input.bundleId,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tables.app.id, id))
        .returning()

      return updatedApp[0]
    },
  },
})
