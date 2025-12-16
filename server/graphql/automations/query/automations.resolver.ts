import { defineQuery } from 'nitro-graphql/utils/define'
import { eq } from 'drizzle-orm'

export const automationsQuery = defineQuery({
  automations: {
    resolve: async (_parent, { appId }, { context }) => {
      const { useDatabase, tables } = context
      const db = useDatabase()

      if (appId) {
        const automations = await db
          .select()
          .from(tables.automation)
          .where(eq(tables.automation.appId, appId))
          .orderBy(tables.automation.createdAt)

        return automations
      }

      const automations = await db
        .select()
        .from(tables.automation)
        .orderBy(tables.automation.createdAt)

      return automations
    },
  },
})

