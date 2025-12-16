import { and, count, eq, inArray } from 'drizzle-orm'
import { defineMutation } from 'nitro-graphql/utils/define'

const MAX_NOTIFICATIONS = 100 // Limite de notificações por agendamento múltiplo

export const scheduleNotificationMutation = defineMutation({
  scheduleNotification: {
    resolve: async (_parent, { input }, { context }) => {
      const { useDatabase, tables } = context
      const db = useDatabase()

      // Suportar tanto scheduledAt (legado) quanto scheduleTimes (novo)
      const hasScheduleTimes = input.scheduleTimes && Array.isArray(input.scheduleTimes) && input.scheduleTimes.length > 0
      const hasScheduledAt = !!input.scheduledAt

      if (!hasScheduleTimes && !hasScheduledAt) {
        throw createError({
          statusCode: 400,
          message: 'Either scheduledAt or scheduleTimes is required for scheduled notifications',
        })
      }

      // Calcular target devices count (usado para todas as notificações)
      let targetDevicesCount = 0

      if (input.targetDevices && input.targetDevices.length > 0) {
        // Specific devices
        const devices = await db
          .select({ count: count() })
          .from(tables.device)
          .where(inArray(tables.device.token, input.targetDevices))
        targetDevicesCount = devices.length
      }
      else {
        // All devices for app (optionally filtered by platform)
        const whereConditions = [eq(tables.device.appId, input.appId)]

        if (input.platforms && input.platforms.length > 0) {
          whereConditions.push(inArray(tables.device.platform, input.platforms.map((p: string) => p.toLowerCase())))
        }

        const devices = await db
          .select({ count: count() })
          .from(tables.device)
          .where(and(...whereConditions))

        targetDevicesCount = devices.length
      }

      // Se usar scheduleTimes, criar múltiplas notificações
      if (hasScheduleTimes) {
        const scheduleTimes = input.scheduleTimes as Array<{ date: string; times: string[] }>
        
        // Validar número total de notificações
        const totalNotifications = scheduleTimes.reduce((sum, st) => sum + st.times.length, 0)
        if (totalNotifications > MAX_NOTIFICATIONS) {
          throw createError({
            statusCode: 400,
            message: `Maximum ${MAX_NOTIFICATIONS} notifications allowed. Requested ${totalNotifications}.`,
          })
        }

        const notifications = []
        const now = new Date()

        // Criar uma notificação para cada combinação data/horário
        for (const scheduleTime of scheduleTimes) {
          const dateStr = scheduleTime.date
          const times = scheduleTime.times

          for (const timeStr of times) {
            // Combinar data e horário
            const [hours, minutes] = timeStr.split(':').map(Number)
            const scheduledDate = new Date(`${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`)

            // Validar que não está no passado
            if (scheduledDate < now) {
              throw createError({
                statusCode: 400,
                message: `Scheduled time ${dateStr} ${timeStr} is in the past`,
              })
            }

            const notification = await db
              .insert(tables.notification)
              .values({
                appId: input.appId,
                title: input.title,
                body: input.body,
                data: input.data,
                imageUrl: input.imageUrl,
                clickAction: input.clickAction,
                sound: input.sound,
                badge: input.badge,
                status: 'SCHEDULED',
                scheduledAt: scheduledDate.toISOString(),
                targetDevices: input.targetDevices,
                platforms: input.platforms,
                totalTargets: targetDevicesCount,
                totalSent: 0,
                totalDelivered: 0,
                totalFailed: 0,
                totalClicked: 0,
              })
              .returning()

            notifications.push(notification[0])
          }
        }

        // Retornar a primeira notificação (para compatibilidade)
        return {
          ...notifications[0],
          totalTargets: targetDevicesCount,
        }
      }

      // Modo legado: uma única notificação com scheduledAt
      const newNotification = await db
        .insert(tables.notification)
        .values({
          appId: input.appId,
          title: input.title,
          body: input.body,
          data: input.data,
          imageUrl: input.imageUrl,
          clickAction: input.clickAction,
          sound: input.sound,
          badge: input.badge,
          status: 'SCHEDULED',
          scheduledAt: new Date(input.scheduledAt).toISOString(),
          targetDevices: input.targetDevices,
          platforms: input.platforms,
          totalTargets: targetDevicesCount,
          totalSent: 0,
          totalDelivered: 0,
          totalFailed: 0,
          totalClicked: 0,
        })
        .returning()

      return {
        ...newNotification[0],
        totalTargets: targetDevicesCount,
      }
    },
  },
})
