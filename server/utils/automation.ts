import type { automation } from '~~/server/database/schema'

type AutomationData = {
  type: 'SUBSCRIPTION' | 'RECURRING'
  frequency?: 'DAILY' | 'WEEKLY'
  timeOfDay?: string
  daysOfWeek?: number[] | null
  startDate?: string | null
  endDate?: string | null
}

/**
 * Calcula a próxima execução de uma automação recorrente
 */
export function calculateNextRunAt(automation: AutomationData): string | undefined {
  if (automation.type !== 'RECURRING' || !automation.frequency || !automation.timeOfDay) {
    return undefined
  }

  const now = new Date()
  const [hours, minutes] = automation.timeOfDay.split(':').map(Number)

  // Verificar se há data de início e se ainda não passou
  if (automation.startDate) {
    const startDate = new Date(automation.startDate)
    if (startDate > now) {
      // Se a data de início é no futuro, usar ela
      const nextRun = new Date(startDate)
      nextRun.setHours(hours, minutes, 0, 0)
      if (nextRun < startDate) {
        // Se o horário do dia de início já passou, ir para o próximo dia
        nextRun.setDate(nextRun.getDate() + 1)
      }
      return nextRun.toISOString()
    }
  }

  // Verificar se há data de fim e se já passou
  if (automation.endDate) {
    const endDate = new Date(automation.endDate)
    if (endDate < now) {
      return undefined // Automação expirou
    }
  }

  if (automation.frequency === 'DAILY') {
    // Para diário, calcular próximo horário hoje ou amanhã
    const nextRun = new Date(now)
    nextRun.setHours(hours, minutes, 0, 0)

    if (nextRun <= now) {
      // Se o horário de hoje já passou, agendar para amanhã
      nextRun.setDate(nextRun.getDate() + 1)
    }

    return nextRun.toISOString()
  }

  if (automation.frequency === 'WEEKLY') {
    // Para semanal, encontrar próximo dia da semana válido
    if (!automation.daysOfWeek || automation.daysOfWeek.length === 0) {
      return undefined
    }

    const today = now.getDay() // 0 = domingo, 6 = sábado
    const validDays = automation.daysOfWeek.sort((a, b) => a - b)

    // Verificar se hoje é um dia válido e o horário ainda não passou
    const todayTime = new Date(now)
    todayTime.setHours(hours, minutes, 0, 0)
    
    if (validDays.includes(today) && todayTime > now) {
      // Hoje é válido e o horário ainda não passou
      return todayTime.toISOString()
    }

    // Encontrar próximo dia válido nesta semana
    const nextDayThisWeek = validDays.find(day => day > today)

    if (nextDayThisWeek !== undefined) {
      const nextRun = new Date(now)
      const daysUntilNext = nextDayThisWeek - today
      nextRun.setDate(nextRun.getDate() + daysUntilNext)
      nextRun.setHours(hours, minutes, 0, 0)
      return nextRun.toISOString()
    }

    // Se não há dia válido nesta semana, usar o primeiro dia da próxima semana
    const firstDayNextWeek = validDays[0]
    const nextRun = new Date(now)
    const daysUntilNext = 7 - today + firstDayNextWeek
    nextRun.setDate(nextRun.getDate() + daysUntilNext)
    nextRun.setHours(hours, minutes, 0, 0)
    return nextRun.toISOString()
  }

  return undefined
}

/**
 * Verifica se uma automação deve rodar hoje baseado em daysOfWeek
 */
export function shouldRunToday(automation: AutomationData): boolean {
  if (automation.type !== 'RECURRING' || automation.frequency !== 'WEEKLY') {
    return true // Para diário ou subscription, sempre pode rodar
  }

  if (!automation.daysOfWeek || automation.daysOfWeek.length === 0) {
    return false
  }

  const today = new Date().getDay()
  return automation.daysOfWeek.includes(today)
}

/**
 * Processa automações de inscrição quando um dispositivo é registrado
 */
export async function processSubscriptionAutomations(
  appId: string,
  deviceId: string,
  db: any,
  tables: any,
): Promise<void> {
  // Buscar automações SUBSCRIPTION ativas para o app
  const { eq, and } = await import('drizzle-orm')
  const automations = await db
    .select()
    .from(tables.automation)
    .where(
      and(
        eq(tables.automation.appId, appId),
        eq(tables.automation.type, 'SUBSCRIPTION'),
        eq(tables.automation.isActive, true),
      ),
    )

  if (automations.length === 0) {
    return
  }

  // Buscar o dispositivo para obter o token
  const device = await db
    .select()
    .from(tables.device)
    .where(eq(tables.device.id, deviceId))
    .limit(1)

  if (device.length === 0) {
    return
  }

  const deviceToken = device[0].token

  // Para cada automação, criar notificação
  for (const automation of automations) {
    const template = automation.notificationTemplate as Record<string, any>

    // Calcular scheduledAt com delay se configurado
    let scheduledAt: string | undefined
    if (automation.delayMinutes && automation.delayMinutes > 0) {
      const delayDate = new Date()
      delayDate.setMinutes(delayDate.getMinutes() + automation.delayMinutes)
      scheduledAt = delayDate.toISOString()
    }

    // Criar notificação
    await db
      .insert(tables.notification)
      .values({
        appId,
        automationId: automation.id,
        title: template.title,
        body: template.body,
        data: template.data,
        imageUrl: template.imageUrl,
        clickAction: template.clickAction,
        sound: template.sound,
        badge: template.badge,
        status: scheduledAt ? 'SCHEDULED' : 'PENDING',
        scheduledAt,
        targetDevices: [deviceToken], // Enviar apenas para o dispositivo recém-registrado (usar token)
        totalTargets: 1,
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        totalClicked: 0,
      })
  }
}

