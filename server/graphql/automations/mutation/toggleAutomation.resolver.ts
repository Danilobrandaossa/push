import { defineMutation } from 'nitro-graphql/utils/define'
import { eq } from 'drizzle-orm'

export const toggleAutomationMutation = defineMutation({
  toggleAutomation: {
    resolve: async (_parent, { id }, { context }) => {
      const { useDatabase, tables } = context
      const db = useDatabase()

      // Buscar automação
      const existing = await db
        .select()
        .from(tables.automation)
        .where(eq(tables.automation.id, id))
        .limit(1)

      if (existing.length === 0) {
        throw createError({
          statusCode: 404,
          message: 'Automation not found',
        })
      }

      // Toggle isActive
      const updated = await db
        .update(tables.automation)
        .set({
          isActive: !existing[0].isActive,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(tables.automation.id, id))
        .returning()

      return updated[0]
    },
  },
})

