import { eq } from 'drizzle-orm'
import { defineField } from 'nitro-graphql/utils/define'

export const automationFieldsResolver = defineField({
  Automation: {
    app: {
      resolve: async (parent, _args, { context }) => {
        const { dataloaders } = context
        return await dataloaders.appLoader.load(parent.appId)
      },
    },

    notifications: {
      resolve: async (parent, _args, { context }) => {
        const { useDatabase, tables } = context
        const db = useDatabase()

        const notifications = await db
          .select()
          .from(tables.notification)
          .where(eq(tables.notification.automationId, parent.id))
          .orderBy(tables.notification.createdAt)

        return notifications
      },
    },
  },
})

