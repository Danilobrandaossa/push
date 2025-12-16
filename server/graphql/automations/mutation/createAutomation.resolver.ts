import { defineMutation } from 'nitro-graphql/utils/define'
import { calculateNextRunAt } from '~~/server/utils/automation'

export const createAutomationMutation = defineMutation({
  createAutomation: {
    resolve: async (_parent, { input }, { context }) => {
      const { useDatabase, tables } = context
      const db = useDatabase()

      // Validação básica
      if (input.type === 'SUBSCRIPTION' && input.delayMinutes && input.delayMinutes < 0) {
        throw createError({
          statusCode: 400,
          message: 'delayMinutes must be a positive number',
        })
      }

      if (input.type === 'RECURRING') {
        if (!input.frequency) {
          throw createError({
            statusCode: 400,
            message: 'frequency is required for RECURRING automations',
          })
        }
        if (!input.timeOfDay) {
          throw createError({
            statusCode: 400,
            message: 'timeOfDay is required for RECURRING automations',
          })
        }
        if (input.frequency === 'WEEKLY' && (!input.daysOfWeek || (input.daysOfWeek as number[]).length === 0)) {
          throw createError({
            statusCode: 400,
            message: 'daysOfWeek is required for WEEKLY automations',
          })
        }
      }

      // Validar template de notificação
      const template = input.notificationTemplate as Record<string, any>
      if (!template.title || !template.body) {
        throw createError({
          statusCode: 400,
          message: 'notificationTemplate must contain title and body',
        })
      }

      // Calcular nextRunAt para automações RECURRING
      let nextRunAt: string | undefined
      if (input.type === 'RECURRING') {
        const automationData = {
          type: input.type,
          frequency: input.frequency,
          timeOfDay: input.timeOfDay,
          daysOfWeek: input.daysOfWeek,
          startDate: input.startDate,
          endDate: input.endDate,
        }
        nextRunAt = calculateNextRunAt(automationData as any)
      }

      const newAutomation = await db
        .insert(tables.automation)
        .values({
          appId: input.appId,
          name: input.name,
          description: input.description,
          type: input.type,
          isActive: true,
          notificationTemplate: input.notificationTemplate,
          delayMinutes: input.delayMinutes,
          frequency: input.frequency,
          timeOfDay: input.timeOfDay,
          daysOfWeek: input.daysOfWeek,
          startDate: input.startDate,
          endDate: input.endDate,
          nextRunAt,
        })
        .returning()

      return newAutomation[0]
    },
  },
})

