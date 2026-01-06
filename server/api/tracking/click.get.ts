import { getDatabase } from '~~/server/database/connection'
import { deliveryLog, notification } from '~~/server/database/schema'
import { eq, and, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const { n, d, u } = query

    // Default redirect to home if no URL provided
    if (!u) {
        return sendRedirect(event, '/')
    }

    const url = String(u)

    // Track stats if we have notification and device IDs
    if (n && d) {
        const notificationId = String(n)
        const deviceId = String(d)
        const db = getDatabase()

        try {
            // Execute tracking in background (don't block redirect too much)
            // Although for serverless functions we should await.

            // Update notification stats
            await db.execute(sql`
        UPDATE notification
        SET "totalClicked" = "totalClicked" + 1,
            "updatedAt" = NOW()
        WHERE id = ${notificationId}
      `)

            // Update delivery log
            await db.update(deliveryLog)
                .set({
                    status: 'CLICKED',
                    clickedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                })
                .where(and(
                    eq(deliveryLog.notificationId, notificationId),
                    eq(deliveryLog.deviceId, deviceId)
                ))
        } catch (e) {
            console.error('[Tracking] Failed to track click:', e)
            // Don't fail the redirect
        }
    }

    return sendRedirect(event, url)
})
