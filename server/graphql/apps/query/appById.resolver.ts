import { eq } from 'drizzle-orm'
import { defineQuery } from 'nitro-graphql/utils/define'
import { decryptSensitiveData, isDataEncrypted } from '~~/server/utils/crypto'

export const appByIdQuery = defineQuery({
  app: {
    resolve: async (_parent, { id }, { context }) => {
      const { useDatabase, tables } = context
      const db = useDatabase()

      const result = await db
        .select()
        .from(tables.app)
        .where(eq(tables.app.id, id))
        .limit(1)

      if (!result[0])
        return null

      const app = result[0]

      // Decrypt sensitive fields if they are encrypted
      if (app.vapidPrivateKey && isDataEncrypted(app.vapidPrivateKey)) {
        app.vapidPrivateKey = decryptSensitiveData(app.vapidPrivateKey)
      }

      if (app.apnsPrivateKey && isDataEncrypted(app.apnsPrivateKey)) {
        app.apnsPrivateKey = decryptSensitiveData(app.apnsPrivateKey)
      }

      if (app.fcmServiceAccount && isDataEncrypted(app.fcmServiceAccount)) {
        app.fcmServiceAccount = decryptSensitiveData(app.fcmServiceAccount)
      }

      return app
    },
  },
})
