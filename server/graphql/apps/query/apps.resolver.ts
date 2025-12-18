import { defineQuery } from 'nitro-graphql/utils/define'
import { decryptSensitiveData, isDataEncrypted } from '~~/server/utils/crypto'

export const appsQuery = defineQuery({
  apps: {
    resolve: async (_parent, args, { context }) => {
      const { useDatabase, tables } = context
      const db = useDatabase()

      const apps = await db
        .select()
        .from(tables.app)
        .orderBy(tables.app.createdAt)

      // Decrypt sensitive fields for each app
      return apps.map((app) => {
        const decryptedApp = { ...app }

        if (decryptedApp.vapidPrivateKey && isDataEncrypted(decryptedApp.vapidPrivateKey)) {
          decryptedApp.vapidPrivateKey = decryptSensitiveData(decryptedApp.vapidPrivateKey)
        }

        if (decryptedApp.apnsPrivateKey && isDataEncrypted(decryptedApp.apnsPrivateKey)) {
          decryptedApp.apnsPrivateKey = decryptSensitiveData(decryptedApp.apnsPrivateKey)
        }

        if (decryptedApp.fcmServiceAccount && isDataEncrypted(decryptedApp.fcmServiceAccount)) {
          decryptedApp.fcmServiceAccount = decryptSensitiveData(decryptedApp.fcmServiceAccount)
        }

        return decryptedApp
      })
    },
  },
})
