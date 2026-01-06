import { eq } from 'drizzle-orm'
import { defineField } from 'nitro-graphql/utils/define'

export const automationFieldsResolver = defineField({
  Automation: {
    app: {
      resolve: async (parent, _args, { context }) => {
        const { dataloaders } = context
        return await dataloaders.appLoader.load(parent.appId)
      },
    },

    notifications: {
      resolve: async (parent, _args, { context }) => {
        const { useDatabase, tables } = context
        const db = useDatabase()

        const notifications = await db
          .select()
          .from(tables.notification)
          .where(eq(tables.notification.automationId, parent.id))
          .orderBy(tables.notification.createdAt)

        return notifications
      },
    },

    stats: {
      resolve: async (parent, _args, { context }) => {
        const { useDatabase, tables } = context
        const db = useDatabase()

        // Fetch all notifications for this automation to aggregate
        // Ideally this should be a direct aggregate query for performance, but this is simpler for now
        // and reuses the existing relationship logic if cached, or we can query aggregates directly.
        // Let's query aggregates directly for efficiency.

        // Note: We can't easily use Drizzle's `count` with `groupBy` in a clean way in this context 
        // without more complex SQL, so let's fetch the raw counts.
        const notifications = await db
          .select({
            sent: tables.notification.totalSent,
            delivered: tables.notification.totalDelivered,
            failed: tables.notification.totalFailed,
            clicked: tables.notification.totalClicked,
            targets: tables.notification.totalTargets,
          })
          .from(tables.notification)
          .where(eq(tables.notification.automationId, parent.id))

        const stats = notifications.reduce(
          (acc, curr) => {
            acc.sent += curr.sent || 0
            acc.delivered += curr.delivered || 0
            acc.failed += curr.failed || 0
            acc.clicks += curr.clicked || 0
            acc.targets += curr.targets || 0
            return acc
          },
          { sent: 0, delivered: 0, failed: 0, clicks: 0, targets: 0 }
        )

        return {
          sent: stats.sent,
          delivered: stats.delivered,
          failed: stats.failed,
          clicks: stats.clicks,
          deliveryRate: stats.targets > 0 ? Math.round((stats.delivered / stats.targets) * 100) : 0,
          ctr: stats.delivered > 0 ? Math.round((stats.clicks / stats.delivered) * 1000) / 10 : 0
        }
      },
    },
  },
})

