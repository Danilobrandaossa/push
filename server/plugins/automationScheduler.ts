import { and, eq, lte } from 'drizzle-orm'
import { getDatabase } from '../database/connection'
import { automation, notification } from '../database/schema'
import { calculateNextRunAt, shouldRunToday } from '../utils/automation'

const SCHEDULER_INTERVAL = 3600000 // 1 hora
const BATCH_SIZE = 50

let schedulerInterval: ReturnType<typeof setInterval> | null = null

async function processRecurringAutomations() {
  const db = getDatabase()

  try {
    const now = new Date().toISOString()

    // Buscar automações RECURRING ativas com nextRunAt <= now
    const dueAutomations = await db
      .select()
      .from(automation)
      .where(
        and(
          eq(automation.type, 'RECURRING'),
          eq(automation.isActive, true),
          lte(automation.nextRunAt, now),
        ),
      )
      .limit(BATCH_SIZE)

    if (dueAutomations.length === 0) {
      return
    }

    console.log(`[AutomationScheduler] Found ${dueAutomations.length} recurring automations to process`)

    for (const auto of dueAutomations) {
      try {
        // Verificar se deve rodar hoje (para WEEKLY)
        const automationData = {
          type: auto.type,
          frequency: auto.frequency,
          timeOfDay: auto.timeOfDay,
          daysOfWeek: auto.daysOfWeek as number[] | null,
          startDate: auto.startDate,
          endDate: auto.endDate,
        }

        if (!shouldRunToday(automationData)) {
          // Se não deve rodar hoje, calcular próximo nextRunAt e continuar
          const nextRun = calculateNextRunAt(automationData)
          if (nextRun) {
            await db
              .update(automation)
              .set({ nextRunAt: nextRun, updatedAt: new Date().toISOString() })
              .where(eq(automation.id, auto.id))
          }
          continue
        }

        // Verificar se está dentro do período (startDate/endDate)
        if (auto.startDate && new Date(auto.startDate) > new Date()) {
          continue // Ainda não começou
        }

        if (auto.endDate && new Date(auto.endDate) < new Date()) {
          // Já expirou, desativar
          await db
            .update(automation)
            .set({ isActive: false, updatedAt: new Date().toISOString() })
            .where(eq(automation.id, auto.id))
          continue
        }

        // Criar notificações baseadas nos templates
        const templates = auto.notificationTemplates as Array<Record<string, any>>

        if (!templates || templates.length === 0) {
          console.warn(`[AutomationScheduler] Automation ${auto.id} has no templates, skipping`)
          continue
        }

        // Calcular delay acumulado para cada template
        let accumulatedDelayMinutes = 0

        for (const template of templates) {
          // Adicionar delay do template atual ao delay acumulado
          accumulatedDelayMinutes += template.delayMinutes || 0

          // Calcular scheduledAt com delay acumulado
          let scheduledAt: string | undefined
          let status: 'PENDING' | 'SCHEDULED' = 'PENDING'
          
          if (accumulatedDelayMinutes > 0) {
            const delayDate = new Date()
            delayDate.setMinutes(delayDate.getMinutes() + accumulatedDelayMinutes)
            scheduledAt = delayDate.toISOString()
            status = 'SCHEDULED'
          }

          const newNotification = await db
            .insert(notification)
            .values({
              appId: auto.appId,
              automationId: auto.id,
              title: template.title,
              body: template.body,
              data: template.data,
              imageUrl: template.imageUrl,
              clickAction: template.clickAction,
              sound: template.sound,
              badge: template.badge,
              status,
              scheduledAt,
              totalTargets: 0, // Será calculado pelo scheduler de notificações
              totalSent: 0,
              totalDelivered: 0,
              totalFailed: 0,
              totalClicked: 0,
            })
            .returning()

          console.log(`[AutomationScheduler] Created notification ${newNotification[0].id} from automation ${auto.id} (delay: ${accumulatedDelayMinutes}min)`)
        }

        // Calcular próximo nextRunAt
        const nextRun = calculateNextRunAt(automationData)
        if (nextRun) {
          await db
            .update(automation)
            .set({ nextRunAt: nextRun, updatedAt: new Date().toISOString() })
            .where(eq(automation.id, auto.id))
        }
        else {
          // Se não há próximo run, desativar automação
          await db
            .update(automation)
            .set({ isActive: false, updatedAt: new Date().toISOString() })
            .where(eq(automation.id, auto.id))
        }
      }
      catch (error) {
        console.error(`[AutomationScheduler] Error processing automation ${auto.id}:`, error)
      }
    }
  }
  catch (error) {
    console.error('[AutomationScheduler] Error in processRecurringAutomations:', error)
  }
}

function startAutomationScheduler() {
  if (schedulerInterval) {
    console.log('[AutomationScheduler] Already running')
    return
  }

  // Run immediately on start
  processRecurringAutomations()

  // Then run every interval
  schedulerInterval = setInterval(processRecurringAutomations, SCHEDULER_INTERVAL)

  console.log(`[AutomationScheduler] Started (interval: ${SCHEDULER_INTERVAL}ms)`)
}

function stopAutomationScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval)
    schedulerInterval = null
    console.log('[AutomationScheduler] Stopped')
  }
}

export default defineNitroPlugin((nitroApp) => {
  // Only start scheduler if enabled
  if (process.env.AUTOMATION_SCHEDULER_ENABLED === 'false') {
    console.log('[AutomationScheduler] Disabled via environment variable')
    return
  }

  // Only start scheduler if not in test environment
  if (process.env.NODE_ENV === 'test') {
    console.log('[AutomationScheduler] Skipping in test environment')
    return
  }

  // Start the scheduler
  try {
    startAutomationScheduler()
  }
  catch (error) {
    console.error('[AutomationScheduler] Failed to start:', error)
  }

  // Handle graceful shutdown
  nitroApp.hooks.hook('close', () => {
    stopAutomationScheduler()
  })
})

