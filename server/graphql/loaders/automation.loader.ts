import type { Database } from './types'
import DataLoader from 'dataloader'
import { eq, inArray } from 'drizzle-orm'
import * as tables from '~~/server/database/schema'

export function createAutomationLoader(db: Database) {
  return new DataLoader<string, typeof tables.automation.$inferSelect | null>(
    async (ids) => {
      const automations = await db
        .select()
        .from(tables.automation)
        .where(inArray(tables.automation.id, ids as string[]))

      return ids.map(id => automations.find(automation => automation.id === id) || null)
    },
  )
}

export function createAutomationsByAppLoader(db: Database) {
  return new DataLoader<string, (typeof tables.automation.$inferSelect)[]>(
    async (appIds) => {
      const automations = await db
        .select()
        .from(tables.automation)
        .where(inArray(tables.automation.appId, appIds as string[]))
        .orderBy(tables.automation.createdAt)

      return appIds.map(appId => automations.filter(automation => automation.appId === appId))
    },
  )
}

