import { defineMutation } from 'nitro-graphql/utils/define'
import { calculateNextRunAt } from '~~/server/utils/automation'

export const createAutomationMutation = defineMutation({
  createAutomation: {
    resolve: async (_parent, { input }, { context }) => {
      const { useDatabase, tables } = context
      const db = useDatabase()

      // Validação básica removida - delayMinutes agora está em cada template

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

      // Validar templates de notificação
      if (!input.notificationTemplates || input.notificationTemplates.length === 0) {
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
          notificationTemplates: input.notificationTemplates,
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

