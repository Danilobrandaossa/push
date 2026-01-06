import { sql, eq } from 'drizzle-orm'
import { getDatabase } from '../database/connection'
import { device, notification } from '../database/schema'

async function debugStats() {
    const db = getDatabase()
    const appId = '019b31d9-9046-766d-8170-05a47332f4fe'

    console.log(`Checking stats for App ID: ${appId}`)

    // Count Devices
    const devices = await db.select({ count: sql<number>`count(*)` })
        .from(device)
        .where(eq(device.appId, appId))

    console.log('Total Devices:', devices[0]?.count)

    // Count Notifications
    const notifications = await db.select({ count: sql<number>`count(*)` })
        .from(notification)
        .where(eq(notification.appId, appId))

    console.log('Total Notifications:', notifications[0]?.count)

    // List first 5 devices
    const someDevices = await db.select().from(device).where(eq(device.appId, appId)).limit(5)
    console.log('Sample devices:', someDevices)
}

debugStats().catch(console.error).finally(() => process.exit())
