import { and, eq, inArray, ne, desc } from 'drizzle-orm'
import { defineMutation } from 'nitro-graphql/utils/define'
import { getProviderForApp } from '~~/server/providers'

export const notificationMutations = defineMutation({
  sendNotification: {
    resolve: async (_parent, { input }, { context }) => {
      const { useDatabase, tables } = context
      const db = useDatabase()
      // Create notification record
      const newNotification = await db
        .insert(tables.notification)
        .values({
          appId: input.appId,
          title: input.title,
          body: input.body,
          data: input.data,
          imageUrl: input.imageUrl,
          clickAction: input.clickAction,
          sound: input.sound,
          badge: input.badge,
          status: input.scheduledAt ? 'SCHEDULED' : 'PENDING',
          scheduledAt: input.scheduledAt,
          totalTargets: 0, // Will be calculated
          totalSent: 0,
          totalDelivered: 0,
          totalFailed: 0,
          totalClicked: 0,
        })
        .returning()

      // Get target devices
      let targetDevices = []

      if (input.targetDevices && input.targetDevices.length > 0) {
        // Specific devices - include ACTIVE, INACTIVE, and EXPIRED for testing
        // (user may want to test even if device is marked as expired)
        targetDevices = await db
          .select()
          .from(tables.device)
          .where(
            and(
              eq(tables.device.appId, input.appId),
              inArray(tables.device.token, input.targetDevices)
              // Don't filter by status when targeting specific devices - allow testing expired devices
            )
          )
        console.log(`[Notification] Found ${targetDevices.length} target devices by token (including all statuses for testing)`)
      }
      else {
        // All devices for app (optionally filtered by platform) - include ACTIVE and INACTIVE for testing
        const whereConditions = [
          eq(tables.device.appId, input.appId),
          inArray(tables.device.status, ['ACTIVE', 'INACTIVE']) // Include inactive for testing
        ]

        if (input.platforms && input.platforms.length > 0) {
          whereConditions.push(inArray(tables.device.platform, input.platforms))
        }

        targetDevices = await db
          .select()
          .from(tables.device)
          .where(and(...whereConditions))

        console.log(`[Notification] Found ${targetDevices.length} target devices for app ${input.appId}`, {
          platforms: input.platforms,
          devices: targetDevices.map(d => ({
            id: d.id,
            platform: d.platform,
            status: d.status,
            hasWebPushKeys: !!(d.webPushP256dh && d.webPushAuth),
            tokenPreview: d.token?.substring(0, 50) + '...'
          }))
        })
      }

      // Update notification with target count
      await db
        .update(tables.notification)
        .set({ totalTargets: targetDevices.length })
        .where(eq(tables.notification.id, newNotification[0].id))

      // Send notifications to devices
      let totalSent = 0
      let totalFailed = 0
      const deliveryLogs: Array<typeof tables.deliveryLog.$inferInsert> = []

      if (!input.scheduledAt && targetDevices.length > 0) {
        // Group devices by platform for efficient sending
        const devicesByPlatform = targetDevices.reduce((acc: Record<string, any[]>, device: any) => {
          // Normalize platform: convert to lowercase and handle enum values
          let platform = device.platform?.toLowerCase() || 'unknown'

          // Map enum values to provider format
          if (platform === 'ios') {
            platform = 'ios'
          } else if (platform === 'android') {
            platform = 'android'
          } else if (platform === 'web') {
            platform = 'web'
          }

          if (!acc[platform])
            acc[platform] = []
          acc[platform].push(device)
          return acc
        }, {} as Record<string, any[]>)

        console.log(`[Notification] Devices grouped by platform:`, Object.keys(devicesByPlatform).map(p => `${p}: ${devicesByPlatform[p].length}`))

        // Send to each platform
        for (const [platform, devices] of Object.entries(devicesByPlatform)) {
          console.log(`[Notification] Processing ${devices.length} devices for platform: ${platform}`)
          try {
            // Map platform to provider format (ios, android, web)
            const providerPlatform = platform.toLowerCase() as 'ios' | 'android' | 'web'
            console.log(`[Notification] Using provider platform: ${providerPlatform}`)
            const provider = await getProviderForApp(input.appId, providerPlatform)
            console.log(`[Notification] Provider created for platform ${platform}`)

            for (const device of (devices as any[])) {
              try {
                console.log(`[Notification] Processing device ${device.id} (platform: ${device.platform})`)

                // Build notification payload
                const notificationPayload = {
                  title: input.title,
                  body: input.body,
                  data: input.data ? (typeof input.data === 'string' ? JSON.parse(input.data) : input.data) : undefined,
                  badge: input.badge,
                  sound: input.sound,
                  clickAction: input.clickAction,
                }

                // WebPush requires subscription object with keys
                let message
                if (platform === 'web') {
                  // Validate WebPush keys exist - skip device if missing
                  if (!device.webPushP256dh || !device.webPushAuth) {
                    console.warn(`[Notification] Skipping device ${device.id}: WebPush keys missing (p256dh/auth). Device needs to re-subscribe.`, {
                      hasP256dh: !!device.webPushP256dh,
                      hasAuth: !!device.webPushAuth,
                      token: device.token?.substring(0, 50) + '...'
                    })
                    totalFailed++
                    deliveryLogs.push({
                      notificationId: newNotification[0].id,
                      deviceId: device.id,
                      status: 'FAILED' as const,
                      errorMessage: 'WebPush subscription keys missing. Device needs to re-subscribe.',
                      sentAt: null,
                    })
                    continue
                  }

                  console.log(`[Notification] Creating WebPush message for device ${device.id}`)
                  message = (provider as any).convertNotificationPayload(
                    notificationPayload,
                    {
                      endpoint: device.token,
                      keys: {
                        p256dh: device.webPushP256dh,
                        auth: device.webPushAuth,
                      },
                    },
                    newNotification[0].id,
                    device.id,
                  )
                  console.log(`[Notification] WebPush message created, sending to endpoint: ${device.token.substring(0, 50)}...`)
                }
                else {
                  // APNs and FCM use device token
                  message = (provider as any).convertNotificationPayload(
                    notificationPayload,
                    device.token,
                    newNotification[0].id,
                    device.id,
                  )
                }

                const result = await (provider as any).sendMessage(message)
                console.log(`[Notification] Send result for device ${device.id}:`, {
                  success: result.success,
                  error: result.error,
                  statusCode: result.statusCode
                })

                if (result.success) {
                  totalSent++
                  console.log(`[Notification] Successfully sent to device ${device.id}`)
                }
                else {
                  totalFailed++
                  console.error(`[Notification] Failed to send to device ${device.id}:`, {
                    error: result.error,
                    statusCode: result.statusCode
                  })

                  // If subscription expired (410), log warning but don't mark as EXPIRED for testing
                  // TEMPORARILY DISABLED: Don't mark as EXPIRED for testing
                  if (result.statusCode === 410) {
                    console.warn(`[Notification] ⚠️ Device ${device.id} subscription expired (410) - NOT marking as EXPIRED for testing`)
                    console.warn(`[Notification] ⚠️ Subscription endpoint: ${device.token.substring(0, 50)}...`)
                    console.warn(`[Notification] ⚠️ Device will continue to be included in sends for testing`)

                    // TEMPORARILY DISABLED: Check for newer device and mark as EXPIRED
                    // Check if there's a newer ACTIVE device for the same user/app
                    // const newerDevice = await db
                    //   .select()
                    //   .from(tables.device)
                    //   .where(
                    //     and(
                    //       eq(tables.device.appId, device.appId),
                    //       eq(tables.device.userId, device.userId || ''),
                    //       eq(tables.device.status, 'ACTIVE'),
                    //       ne(tables.device.token, device.token)
                    //     )
                    //   )
                    //   .orderBy(desc(tables.device.createdAt))
                    //   .limit(1)
                    // 
                    // if (newerDevice.length > 0) {
                    //   console.log(`[Notification] Found newer ACTIVE device for same user, marking old device as EXPIRED`)
                    //   console.log(`[Notification] Old device: ${device.id}, New device: ${newerDevice[0].id}`)
                    // }
                    // 
                    // // Mark as EXPIRED only if no newer device exists
                    // try {
                    //   await db
                    //     .update(tables.device)
                    //     .set({
                    //       status: 'EXPIRED',
                    //       updatedAt: new Date().toISOString(),
                    //     })
                    //     .where(eq(tables.device.id, device.id))
                    //   console.log(`[Notification] Device ${device.id} marked as EXPIRED`)
                    // } catch (updateError) {
                    //   console.error(`[Notification] Failed to mark device ${device.id} as expired:`, updateError)
                    // }
                  }
                  // If VAPID credentials mismatch (403), log detailed warning but continue trying
                  // (Temporarily disabled marking as EXPIRED for testing purposes)
                  else if (result.statusCode === 403 && result.error?.includes('VAPID credentials')) {
                    console.warn(`[Notification] ⚠️ Device ${device.id} has VAPID credentials mismatch (403)`)
                    console.warn(`[Notification] ⚠️ This device was subscribed with a DIFFERENT VAPID key than the current one`)
                    console.warn(`[Notification] ⚠️ WARNING: Continuing to attempt sends for testing (notification will likely fail)`)
                    console.warn(`[Notification] ⚠️ Device details:`, {
                      id: device.id,
                      token: device.token.substring(0, 50) + '...',
                      platform: device.platform,
                      status: device.status,
                      userId: device.userId,
                      createdAt: device.createdAt,
                      hasWebPushKeys: !!(device.webPushP256dh && device.webPushAuth)
                    })
                    console.warn(`[Notification] ⚠️ Current VAPID key: BIJfFcoBwqS1RLu7tjMcdwIQK86T4KdRHhc6mcxFmy0yXp0DeNY8lRl0LSFp4XThozLwobq09dzEOOcSPwstI7k`)
                    console.warn(`[Notification] ⚠️ SOLUTION: Delete this device and create a NEW subscription with the correct VAPID key`)
                    // TEMPORARILY DISABLED: Don't mark as EXPIRED for testing
                    // try {
                    //   await db
                    //     .update(tables.device)
                    //     .set({
                    //       status: 'EXPIRED',
                    //       updatedAt: new Date().toISOString(),
                    //     })
                    //     .where(eq(tables.device.id, device.id))
                    //   console.log(`[Notification] Device ${device.id} marked as EXPIRED due to VAPID mismatch`)
                    // } catch (updateError) {
                    //   console.error(`[Notification] Failed to mark device ${device.id} as expired:`, updateError)
                    // }
                  }
                }

                // Create delivery log
                deliveryLogs.push({
                  notificationId: newNotification[0].id,
                  deviceId: device.id,
                  status: result.success ? ('SENT' as const) : ('FAILED' as const),
                  errorMessage: result.error,
                  providerResponse: { messageId: result.messageId },
                  sentAt: result.success ? new Date().toISOString() : null,
                })
              }
              catch (deviceError) {
                totalFailed++
                console.error(`[Notification] Device error for ${device.id}:`, deviceError)
                deliveryLogs.push({
                  notificationId: newNotification[0].id,
                  deviceId: device.id,
                  status: 'FAILED' as const,
                  errorMessage: deviceError instanceof Error ? deviceError.message : 'Unknown error',
                  sentAt: null,
                })
              }
            }
          }
          catch (providerError) {
            // Provider creation failed, mark all devices for this platform as failed
            totalFailed += (devices as any[]).length
            console.error(`[Notification] Provider error for platform ${platform}:`, providerError)
            for (const device of (devices as any[])) {
              deliveryLogs.push({
                notificationId: newNotification[0].id,
                deviceId: device.id,
                status: 'FAILED' as const,
                errorMessage: `Provider error: ${providerError instanceof Error ? providerError.message : 'Unknown provider error'}`,
                sentAt: null,
              })
            }
          }
        }

        // Insert delivery logs
        if (deliveryLogs.length > 0) {
          await db.insert(tables.deliveryLog).values(deliveryLogs)
        }

        // Update notification statistics
        await db
          .update(tables.notification)
          .set({
            totalSent,
            totalFailed,
            status: 'SENT',
            sentAt: new Date().toISOString(),
          })
          .where(eq(tables.notification.id, newNotification[0].id))
      }

      return {
        ...newNotification[0],
        totalTargets: targetDevices.length,
        totalSent,
        totalFailed,
      }
    },
  },
})
