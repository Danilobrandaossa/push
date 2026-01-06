import { config } from 'dotenv'
config()

import { sql } from 'drizzle-orm'
import { getDatabase } from '../database/connection'

async function debugDeliveryStats() {
    const db = getDatabase()

    console.log('--- Recent Notifications with Delivery Logs ---')
    const notifications = await db.execute(sql`
    SELECT 
      n.id,
      n.title,
      n."totalTargets",
      n."totalSent",
      n."totalDelivered",
      n."totalFailed",
      n."createdAt",
      (SELECT COUNT(*) FROM "deliveryLog" WHERE "notificationId" = n.id AND status = 'SENT') as actual_sent,
      (SELECT COUNT(*) FROM "deliveryLog" WHERE "notificationId" = n.id AND status = 'FAILED') as actual_failed
    FROM notification n
    WHERE n."createdAt" > NOW() - INTERVAL '1 hour'
    ORDER BY n."createdAt" DESC
    LIMIT 5
  `)

    console.table(notifications)

    console.log('\n--- Sample Delivery Logs ---')
    const logs = await db.execute(sql`
    SELECT 
      dl.id,
      dl."notificationId",
      dl.status,
      dl."errorMessage",
      dl."sentAt",
      dl."createdAt"
    FROM "deliveryLog" dl
    ORDER BY dl."createdAt" DESC
    LIMIT 10
  `)

    console.table(logs)

    process.exit(0)
}

debugDeliveryStats().catch(console.error)
