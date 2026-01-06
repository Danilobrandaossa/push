

import { config } from 'dotenv'
config()

import { sql, eq, and } from 'drizzle-orm'

import { getDatabase } from '../database/connection'
import { notification, deliveryLog } from '../database/schema'

async function fixStats() {
    const db = getDatabase()

    console.log('Starting stats fix...')

    // Get all notifications
    const allNotifications = await db
        .select({ id: notification.id })
        .from(notification)

    console.log(`Found ${allNotifications.length} notifications to process`)

    let updated = 0

    for (const notif of allNotifications) {
        // Count aggregated stats from logs
        const stats = await db
            .select({
                status: deliveryLog.status,
                count: sql<number>`count(*)`
            })
            .from(deliveryLog)
            .where(eq(deliveryLog.notificationId, notif.id))
            .groupBy(deliveryLog.status)

        let sent = 0
        let delivered = 0
        let failed = 0

        for (const stat of stats) {
            const count = Number(stat.count)
            if (stat.status === 'SENT') sent += count
            if (stat.status === 'DELIVERED') {
                delivered += count
                // Delivered implies sent
                sent += count
            }
            if (stat.status === 'FAILED') failed += count
        }

        // We can't easily know "pending" from logs if they don't exist yet, 
        // but totalTargeted should be in the notification table. We won't touch totalTargeted.

        // Note: The worker logic increments 'totalSent' for 'DELIVERED' too?
        // Let's verify worker:
        // If success: "totalSent" + 1, "totalDelivered" + 1. 
        // So sent includes delivered. Correct.

        // Update notification
        await db
            .update(notification)
            .set({
                totalSent: sent,
                totalDelivered: delivered,
                totalFailed: failed,
                updatedAt: new Date().toISOString()
            })
            .where(eq(notification.id, notif.id))

        updated++
        if (updated % 100 === 0) {
            console.log(`Processed ${updated} notifications...`)
        }
    }

    console.log('Finished fixing stats.')
}

fixStats().catch(console.error).finally(() => process.exit())
