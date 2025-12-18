import { defineField } from 'nitro-graphql/utils/define'
import { eq } from 'drizzle-orm'

export const deviceFieldsResolver = defineField({
  Device: {
    app: {
      resolve: async (parent, _args, { context }) => {
        const { dataloaders } = context
        return await dataloaders.appLoader.load(parent.appId)
      },
    },

    deliveryLogs: {
      resolve: async (parent, _args, { context }) => {
        const { dataloaders } = context
        return await dataloaders.deliveryLogsByDeviceLoader.load(parent.id)
      },
    },
    
    // Helper field to get current VAPID key from app (for debugging)
    currentVapidPublicKey: {
      resolve: async (parent, _args, { context }) => {
        const { useDatabase, tables } = context
        const db = useDatabase()
        
        const app = await db
          .select({ vapidPublicKey: tables.app.vapidPublicKey })
          .from(tables.app)
          .where(eq(tables.app.id, parent.appId))
          .limit(1)
        
        return app[0]?.vapidPublicKey || null
      },
    },
  },
})
