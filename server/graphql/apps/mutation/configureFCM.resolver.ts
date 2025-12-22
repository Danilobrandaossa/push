import { eq } from 'drizzle-orm'
import { defineMutation } from 'nitro-graphql/utils/define'
import { encryptSensitiveData } from '~~/server/utils/crypto'
import { createError } from 'h3'

export const configureFCMMutation = defineMutation({
  configureFCM: {
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

      // Validate service account JSON
      try {
        JSON.parse(input.serviceAccount)
      }
      catch {
        throw createError({
          statusCode: 400,
          message: 'Invalid service account JSON format',
        })
      }

      // Encrypt sensitive service account JSON before storing (if ENCRYPTION_KEY is available)
      let encryptedServiceAccount: string
      try {
        encryptedServiceAccount = encryptSensitiveData(input.serviceAccount)
      } catch (encryptError) {
        const errorMsg = encryptError instanceof Error ? encryptError.message : 'Unknown error'
        if (errorMsg.includes('ENCRYPTION_KEY')) {
          console.warn('[configureFCM] ⚠️ ENCRYPTION_KEY not available - storing service account unencrypted (not recommended for production)')
          encryptedServiceAccount = input.serviceAccount // Store unencrypted
        } else {
          throw encryptError // Re-throw other encryption errors
        }
      }

      // Update app with FCM configuration
      const updatedApp = await db
        .update(tables.app)
        .set({
          fcmProjectId: input.projectId,
          fcmServerKey: encryptedServiceAccount,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tables.app.id, id))
        .returning()

      return updatedApp[0]
    },
  },
})
