import { defineMutation } from 'nitro-graphql/utils/define'
import { eq } from 'drizzle-orm'
import { calculateNextRunAt } from '~~/server/utils/automation'

export const updateAutomationMutation = defineMutation({
  updateAutomation: {
    resolve: async (_parent, { id, input }, { context }) => {
      const { useDatabase, tables } = context
      const db = useDatabase()

      // Buscar automação existente
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

      const automation = existing[0]

      // Validações
      if (input.notificationTemplates) {
        if (input.notificationTemplates.length === 0) {
          throw createError({
            statusCode: 400,
            message: 'At least one notification template is required',
          })
        }

        // Validar cada template
        for (const template of input.notificationTemplates) {
          if (!template.title || !template.body) {
            throw createError({
              statusCode: 400,
              message: 'Each notification template must contain title and body',
            })
          }
          if (template.delayMinutes < 0) {
            throw createError({
              statusCode: 400,
              message: 'delayMinutes must be a positive number or zero',
            })
          }
        }

        // O primeiro template deve ter delayMinutes = 0
        if (input.notificationTemplates[0].delayMinutes !== 0) {
          throw createError({
            statusCode: 400,
            message: 'The first notification template must have delayMinutes = 0',
          })
        }
      }

      // Preparar dados de atualização
      const updateData: any = {
        updatedAt: new Date().toISOString(),
      }

      if (input.name !== undefined) updateData.name = input.name
      if (input.description !== undefined) updateData.description = input.description
      if (input.isActive !== undefined) updateData.isActive = input.isActive
      if (input.notificationTemplates !== undefined) updateData.notificationTemplates = input.notificationTemplates

      if (automation.type === 'RECURRING') {
        if (input.frequency !== undefined) updateData.frequency = input.frequency
        if (input.timeOfDay !== undefined) updateData.timeOfDay = input.timeOfDay
        if (input.daysOfWeek !== undefined) updateData.daysOfWeek = input.daysOfWeek
        if (input.startDate !== undefined) updateData.startDate = input.startDate
        if (input.endDate !== undefined) updateData.endDate = input.endDate

        // Recalcular nextRunAt se campos relevantes mudaram
        if (input.frequency !== undefined || input.timeOfDay !== undefined || input.daysOfWeek !== undefined || input.startDate !== undefined) {
          const automationData = {
            type: automation.type,
            frequency: input.frequency || automation.frequency,
            timeOfDay: input.timeOfDay || automation.timeOfDay,
            daysOfWeek: input.daysOfWeek || automation.daysOfWeek,
            startDate: input.startDate || automation.startDate,
            endDate: input.endDate || automation.endDate,
          }
          updateData.nextRunAt = calculateNextRunAt(automationData as any)
        }
      }

      const updated = await db
        .update(tables.automation)
        .set(updateData)
        .where(eq(tables.automation.id, id))
        .returning()

      return updated[0]
    },
  },
})

