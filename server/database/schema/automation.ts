import { relations } from 'drizzle-orm'
import { boolean, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'
import { customJsonb, customTimestamp, uuidv7Generator } from '../shared'
import { app } from './app'
import { automationFrequencyEnum, automationTypeEnum } from './enums'
import { notification } from './notification'

export const automation = pgTable('automation', {
  id: uuid().primaryKey().$defaultFn(uuidv7Generator),
  appId: uuid().notNull().references(() => app.id, { onDelete: 'cascade' }),
  name: text().notNull(),
  description: text(),
  type: automationTypeEnum().notNull(),
  isActive: boolean().default(true).notNull(),
  
  // Template da notificação (JSON com title, body, data, etc.)
  notificationTemplate: customJsonb().notNull(),
  
  // Para automação de SUBSCRIPTION
  delayMinutes: integer(), // Delay opcional em minutos antes de enviar
  
  // Para automação RECURRING
  frequency: automationFrequencyEnum(), // DAILY ou WEEKLY
  timeOfDay: text(), // Horário no formato HH:MM (ex: "09:00")
  daysOfWeek: customJsonb(), // Array de números 0-6 (0 = domingo, 6 = sábado)
  startDate: customTimestamp(), // Data de início
  endDate: customTimestamp(), // Data de fim (opcional)
  nextRunAt: customTimestamp(), // Próxima execução agendada
  
  createdAt: customTimestamp().defaultNow().notNull(),
  updatedAt: customTimestamp().defaultNow().notNull(),
})

export const automationRelations = relations(automation, ({ one, many }) => ({
  app: one(app, {
    fields: [automation.appId],
    references: [app.id],
  }),
  notifications: many(notification),
}))

export const selectAutomationSchema = createSelectSchema(automation)
export const insertAutomationSchema = createInsertSchema(automation)

