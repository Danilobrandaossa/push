import { config } from 'dotenv'
config()

import { sql } from 'drizzle-orm'
import { getDatabase } from '../database/connection'

async function fixDeliveryRate() {
    const db = getDatabase()

    console.log('--- Checking current stats calculation ---')

    // The issue is that totalSent includes ALL attempts (including retries)
    // but totalDelivered only counts successful deliveries
    // For delivery rate, we should use: totalDelivered / totalTargets

    const sample = await db.execute(sql`
    SELECT 
      id,
      title,
      "totalTargets",
      "totalSent",
      "totalDelivered",
      "totalFailed",
      CASE 
        WHEN "totalTargets" > 0 
        THEN ROUND(("totalDelivered"::numeric / "totalTargets"::numeric) * 100, 2)
        ELSE 0 
      END as correct_delivery_rate
    FROM notification
    WHERE "totalTargets" > 0
    ORDER BY "createdAt" DESC
    LIMIT 5
  `)

    console.table(sample)

    console.log('\nThe delivery rate should be calculated as: (totalDelivered / totalTargets) * 100')
    console.log('This is already correct in the code, but the UI might be using totalSent instead.')

    process.exit(0)
}

fixDeliveryRate().catch(console.error)
