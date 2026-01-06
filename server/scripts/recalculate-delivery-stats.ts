import { config } from 'dotenv'
config()

import { sql } from 'drizzle-orm'
import { getDatabase } from '../database/connection'

async function recalculateDeliveryStats() {
    const db = getDatabase()

    console.log('--- Recalculating delivery statistics for all notifications ---')

    // Recalculate totalSent and totalDelivered based on actual delivery logs
    // Note: totalSent should count SENT logs, totalDelivered should also count SENT (they're the same for successful deliveries)
    const result = await db.execute(sql`
    UPDATE notification n
    SET 
      "totalSent" = COALESCE((
        SELECT COUNT(*) 
        FROM "deliveryLog" dl 
        WHERE dl."notificationId" = n.id AND dl.status = 'SENT'
      ), 0),
      "totalDelivered" = COALESCE((
        SELECT COUNT(*) 
        FROM "deliveryLog" dl 
        WHERE dl."notificationId" = n.id AND dl.status = 'SENT'
      ), 0),
      "totalFailed" = COALESCE((
        SELECT COUNT(*) 
        FROM "deliveryLog" dl 
        WHERE dl."notificationId" = n.id AND dl.status = 'FAILED'
      ), 0),
      "updatedAt" = NOW()
    WHERE EXISTS (
      SELECT 1 FROM "deliveryLog" WHERE "notificationId" = n.id
    )
  `)

    console.log(`Updated delivery statistics for notifications`)

    console.log('\n--- Verifying a sample notification ---')
    const sample = await db.execute(sql`
    SELECT 
      n.id,
      n.title,
      n."totalTargets",
      n."totalSent",
      n."totalDelivered",
      n."totalFailed",
      (SELECT COUNT(*) FROM "deliveryLog" WHERE "notificationId" = n.id AND status = 'SENT') as actual_sent,
      (SELECT COUNT(*) FROM "deliveryLog" WHERE "notificationId" = n.id AND status = 'FAILED') as actual_failed
    FROM notification n
    WHERE EXISTS (
      SELECT 1 FROM "deliveryLog" dl 
      WHERE dl."notificationId" = n.id AND dl.status = 'SENT'
    )
    ORDER BY n."createdAt" DESC
    LIMIT 3
  `)

    console.table(sample)

    process.exit(0)
}

recalculateDeliveryStats().catch(console.error)
