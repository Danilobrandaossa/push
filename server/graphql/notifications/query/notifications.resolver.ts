import { eq, isNotNull, isNull, and } from 'drizzle-orm'
import { defineQuery } from 'nitro-graphql/utils/define'

export const notificationsQuery = defineQuery({
  notifications: {
    resolve: async (_parent, { appId, filter }, { context }) => {
      const { useDatabase, tables } = context
      const db = useDatabase()

      const conditions = []

      if (appId) {
        conditions.push(eq(tables.notification.appId, appId))
      }

      if (filter) {
        if (filter.isAutomation === true) {
          conditions.push(isNotNull(tables.notification.automationId))
        } else if (filter.isAutomation === false) {
          conditions.push(isNull(tables.notification.automationId))
        }
      }

      return await db
        .select()
        .from(tables.notification)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(tables.notification.createdAt) // Should probably be desc
    },
  },
})
