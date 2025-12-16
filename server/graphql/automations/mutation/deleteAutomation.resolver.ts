import { defineMutation } from 'nitro-graphql/utils/define'
import { eq } from 'drizzle-orm'

export const deleteAutomationMutation = defineMutation({
  deleteAutomation: {
    resolve: async (_parent, { id }, { context }) => {
      const { useDatabase, tables } = context
      const db = useDatabase()

      const result = await db
        .delete(tables.automation)
        .where(eq(tables.automation.id, id))
        .returning()

      return result.length > 0
    },
  },
})

