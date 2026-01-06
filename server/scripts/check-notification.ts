import { config } from 'dotenv'
config()

import { sql } from 'drizzle-orm'
import { getDatabase } from '../database/connection'

async function checkSpecificNotification() {
    const db = getDatabase()

    // Get a notification that has SENT logs
    console.log('--- Finding notification with SENT logs ---')
    const notif = await db.execute(sql`
    SELECT 
      n.id,
      n.title,
      n."totalTargets",
      n."totalSent",
      n."totalDelivered",
      n."totalFailed",
      n."automationId",
      (SELECT COUNT(*) FROM "deliveryLog" WHERE "notificationId" = n.id AND status = 'SENT') as actual_sent_count,
      (SELECT COUNT(*) FROM "deliveryLog" WHERE "notificationId" = n.id AND status = 'FAILED') as actual_failed_count
    FROM notification n
    WHERE EXISTS (
      SELECT 1 FROM "deliveryLog" dl 
      WHERE dl."notificationId" = n.id AND dl.status = 'SENT'
    )
    ORDER BY n."createdAt" DESC
    LIMIT 3
  `)

    console.table(notif)

    if (notif.length > 0) {
        const notificationId = notif[0].id
        console.log(`\n--- Delivery logs for notification ${notificationId} ---`)
        const logs = await db.execute(sql`
      SELECT status, COUNT(*) as count
      FROM "deliveryLog"
      WHERE "notificationId" = ${notificationId}
      GROUP BY status
    `)
        console.table(logs)
    }

    process.exit(0)
}

checkSpecificNotification().catch(console.error)
