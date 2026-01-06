
import { config } from 'dotenv'
config()

import { getDatabase } from '../database/connection'
import { deliveryLog, notification, device } from '../database/schema'
import { eq, and, sql } from 'drizzle-orm'

async function debugTracking() {
    console.log('APP_URL:', process.env.APP_URL)

    const db = getDatabase()

    // 1. Get the most recent sent notification
    const lastLog = await db.query.deliveryLog.findFirst({
        where: eq(deliveryLog.status, 'SENT'),
        orderBy: (log, { desc }) => [desc(log.createdAt)],
        with: {
            notification: true,
            device: true
        }
    })

    if (!lastLog) {
        console.log('No sent delivery logs found to test.')
        return
    }

    console.log('Found sent log:', {
        notificationId: lastLog.notificationId,
        deviceId: lastLog.deviceId,
        status: lastLog.status
    })

    // 2. Simulate what the worker does
    const baseUrl = process.env.APP_URL?.endsWith('/') ? process.env.APP_URL.slice(0, -1) : process.env.APP_URL
    const originalUrl = 'https://example.com'
    const encodedUrl = encodeURIComponent(originalUrl)
    const trackingUrl = `${baseUrl}/api/tracking/click?u=${encodedUrl}&n=${lastLog.notificationId}&d=${lastLog.deviceId}`

    console.log('Generated Tracking URL:', trackingUrl)

    if (!process.env.APP_URL) {
        console.warn('WARNING: APP_URL is not set! Worker would NOT generate tracking URL.')
    }

    // 3. Simulate what click.get.ts does (ONLY if we confirm we want to test DB update - careful modifying real data)
    // Let's just SELECT to see if we can find it by ID exactly as the endpoint does

    const notificationId = lastLog.notificationId
    const deviceId = lastLog.deviceId

    const logCheck = await db.query.deliveryLog.findFirst({
        where: and(
            eq(deliveryLog.notificationId, notificationId),
            eq(deliveryLog.deviceId, deviceId)
        )
    })

    console.log('DB Lookup check:', logCheck ? 'Found' : 'Not Found')

    if (logCheck) {
        console.log('Current stats for notification:', lastLog.notification.totalClicked)
    }
}

debugTracking().catch(console.error)
