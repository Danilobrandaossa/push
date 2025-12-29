import { and, eq, inArray, ne, desc, sql } from 'drizzle-orm'
import { createError } from 'h3'
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
          icon: input.icon || input.imageUrl || undefined, // Usar icon primeiro, fallback para imageUrl
          imageUrl: input.imageUrl || undefined,
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

      if (!newNotification[0]) {
        throw createError({
          statusCode: 500,
          message: 'Failed to create notification',
        })
      }

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
        // All devices for app (optionally filtered by platform) - only ACTIVE devices
        // EXPIRED devices are excluded as they need re-subscription
        const whereConditions = [
          eq(tables.device.appId, input.appId),
          inArray(tables.device.status, ['ACTIVE']) // Only ACTIVE devices
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

      // If no target devices, mark as SENT and return early
      if (targetDevices.length === 0) {
        console.log(`[Notification] No target devices found for app ${input.appId}, marking notification as SENT`)
        await db
          .update(tables.notification)
          .set({
            status: 'SENT',
            totalTargets: 0,
            totalSent: 0,
            totalFailed: 0,
            sentAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(tables.notification.id, newNotification[0].id))

        const updatedNotification = await db
          .select()
          .from(tables.notification)
          .where(eq(tables.notification.id, newNotification[0].id))
          .limit(1)

        return updatedNotification[0] || newNotification[0]
      }

      // Send notifications to devices
      let totalSent = 0
      let totalFailed = 0
      const deliveryLogs: Array<typeof tables.deliveryLog.$inferInsert> = []

      // Only send immediately if not scheduled and there are target devices
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

            // PRE-VALIDATION: For Web Push, get current VAPID key from app to validate against device registration
            // This prevents attempting to send to devices that will definitely fail with 403
            let currentVapidPublicKey: string | null = null
            if (platform === 'web') {
              const appData = await db
                .select({ vapidPublicKey: tables.app.vapidPublicKey })
                .from(tables.app)
                .where(eq(tables.app.id, input.appId))
                .limit(1)
              currentVapidPublicKey = appData[0]?.vapidPublicKey?.replace(/\s+/g, '') || null
              console.log(`[Notification] Current VAPID key for validation: ${currentVapidPublicKey ? currentVapidPublicKey.substring(0, 50) + '...' : 'NOT_FOUND'}`)
            }

            for (const device of (devices as any[])) {
              try {
                console.log(`[Notification] Processing device ${device.id} (platform: ${device.platform})`)

                // PRE-VALIDATION: For Web Push, check if device was registered with current VAPID key
                // Skip devices that will definitely fail with 403 (VAPID mismatch)
                if (platform === 'web' && currentVapidPublicKey && device.vapidPublicKeyUsed) {
                  const deviceVapidKey = device.vapidPublicKeyUsed.replace(/\s+/g, '')
                  const currentKeyNormalized = currentVapidPublicKey.replace(/\s+/g, '')
                  const keysMatch = deviceVapidKey === currentKeyNormalized

                  if (!keysMatch) {
                    console.warn(`[Notification] ⚠️ PRE-VALIDATION FAILED: Device ${device.id} VAPID key mismatch detected`)
                    console.warn(`[Notification] ⚠️   - Key at registration: ${deviceVapidKey.substring(0, 50)}... (length: ${deviceVapidKey.length})`)
                    console.warn(`[Notification] ⚠️   - Current key in app: ${currentKeyNormalized.substring(0, 50)}... (length: ${currentKeyNormalized.length})`)
                    console.warn(`[Notification] ⚠️   - WARNING: Keys don't match but continuing to send for testing`)
                    console.warn(`[Notification] ⚠️   - DISABLED: Marking device as EXPIRED (commented out for testing)`)

                    // DISABLED FOR TESTING: Mark device as EXPIRED and skip sending
                    // try {
                    //   await db
                    //     .update(tables.device)
                    //     .set({
                    //       status: 'EXPIRED',
                    //       updatedAt: new Date().toISOString(),
                    //     })
                    //     .where(eq(tables.device.id, device.id))

                    //   console.log(`[Notification] ✅ Device ${device.id} marked as EXPIRED due to VAPID key mismatch`)
                    // } catch (updateError) {
                    //   console.error(`[Notification] ❌ Failed to mark device ${device.id} as EXPIRED:`, updateError)
                    // }

                    // Continue sending anyway for testing
                    console.warn(`[Notification] ⚠️ Continuing to attempt send despite key mismatch (for testing)`)
                  } else {
                    // Even if public keys match, the subscription might still fail if:
                    // 1. The private key being used doesn't match the private key that created the subscription
                    // 2. The subscription was created with a different key pair (even if public key looks the same after normalization)
                    // 3. The FCM has cached the subscription with old keys
                    console.log(`[Notification] ✅ PRE-VALIDATION PASSED: Device ${device.id} VAPID keys match (${deviceVapidKey.substring(0, 20)}...) - safe to send`)
                    console.log(`[Notification] 💡 If 403 error occurs despite matching public keys, it means the private key doesn't correspond to the subscription's original key pair`)
                  }
                }

                // Build notification payload
                // Para Web Push: icon é o ícone da notificação, image é imagem grande
                const notificationPayload = {
                  title: input.title,
                  body: input.body,
                  data: input.data ? (typeof input.data === 'string' ? JSON.parse(input.data) : input.data) : undefined,
                  badge: input.badge,
                  sound: input.sound,
                  clickAction: input.clickAction,
                  icon: input.icon || input.imageUrl || undefined, // Usar icon primeiro, fallback para imageUrl
                  image: input.imageUrl || undefined, // image é para imagem grande (usa imageUrl)
                  imageUrl: input.imageUrl || undefined, // Manter para compatibilidade
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
                  // Don't increment totalFailed here - will be incremented in specific error handlers
                  console.error(`[Notification] Failed to send to device ${device.id}:`, {
                    error: result.error,
                    statusCode: result.statusCode
                  })

                  // 🔴 CRITICAL: 410 Gone = Subscription expirada
                  // Subscription expirou ou foi cancelada - endpoint não existe mais no FCM
                  // DISABLED FOR TESTING: Marcar como EXPIRED (comentado para permitir testes)
                  if (result.statusCode === 410) {
                    console.error(`[Notification] 🔴 CRITICAL: Device ${device.id} subscription expired (410 Gone)`)
                    console.error(`[Notification] 🔴 Subscription endpoint: ${device.token.substring(0, 50)}...`)
                    console.error(`[Notification] 🔴 410 = subscription não existe mais no FCM`)
                    console.error(`[Notification] 🔴 DISABLED: Marking device as EXPIRED (commented out for testing)`)

                    // DISABLED FOR TESTING: Marcar como EXPIRED - NÃO deletar (apenas exclusão manual deve deletar)
                    // try {
                    //   await db
                    //     .update(tables.device)
                    //     .set({
                    //       status: 'EXPIRED',
                    //       updatedAt: new Date().toISOString(),
                    //     })
                    //     .where(eq(tables.device.id, device.id))

                    //   console.log(`[Notification] ✅ Device ${device.id} marked as EXPIRED due to 410 Gone`)
                    //   console.log(`[Notification] ✅ This device will not be included in future sends`)
                    //   console.log(`[Notification] ✅ Device can be manually deleted if needed`)
                    // } catch (updateError) {
                    //   console.error(`[Notification] ❌ ERRO ao marcar device ${device.id} como EXPIRED:`, updateError)
                    // }

                    // Create delivery log for this failure
                    deliveryLogs.push({
                      notificationId: newNotification[0].id,
                      deviceId: device.id,
                      status: 'FAILED' as const,
                      errorMessage: `410 Gone: Subscription expired. Device NOT marked as EXPIRED (testing mode).`,
                      sentAt: null,
                    })

                    totalFailed++
                    // Skip to next device
                    continue
                  }
                  // If VAPID credentials mismatch (403), mark device as EXPIRED and skip
                  else if (result.statusCode === 403 && result.error?.includes('VAPID credentials')) {
                    // Get current VAPID key from app
                    const appData = await db
                      .select({ vapidPublicKey: tables.app.vapidPublicKey })
                      .from(tables.app)
                      .where(eq(tables.app.id, device.appId))
                      .limit(1)

                    const currentVapidKey = appData[0]?.vapidPublicKey?.replace(/\s+/g, '') || 'NOT_FOUND'
                    const vapidKeyUsed = device.vapidPublicKeyUsed?.replace(/\s+/g, '') || 'NOT_STORED'
                    const keysMatch = currentVapidKey === vapidKeyUsed

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
                    console.warn(`[Notification] ⚠️ VAPID Key Comparison:`)
                    console.warn(`[Notification] ⚠️   - Key used at registration: ${vapidKeyUsed.substring(0, 50)}... (length: ${vapidKeyUsed.length})`)
                    console.warn(`[Notification] ⚠️   - Current key in app: ${currentVapidKey.substring(0, 50)}... (length: ${currentVapidKey.length})`)
                    console.warn(`[Notification] ⚠️   - Keys match: ${keysMatch}`)
                    if (!keysMatch && vapidKeyUsed !== 'NOT_STORED' && currentVapidKey !== 'NOT_FOUND') {
                      const firstDiff = currentVapidKey.split('').findIndex((c, i) => c !== vapidKeyUsed[i])
                      console.warn(`[Notification] ⚠️   - First difference at position: ${firstDiff}`)
                      console.warn(`[Notification] ⚠️   - Char at position ${firstDiff}: expected '${vapidKeyUsed[firstDiff]}', got '${currentVapidKey[firstDiff]}'`)
                    }

                    // CRITICAL EXPLANATION: Even if public keys match, 403 can still occur if:
                    // 1. The subscription was created with a DIFFERENT private key (even if public key seems the same)
                    // 2. The FCM has cached the subscription with the original key pair
                    // 3. The JWT is signed with a private key that doesn't match the subscription's original key pair
                    if (keysMatch) {
                      console.error(`[Notification] 🔴 CRITICAL: Public keys match, but 403 occurred!`)
                      console.error(`[Notification] 🔴 This means the subscription was created with a DIFFERENT KEY PAIR`)
                      console.error(`[Notification] 🔴 Even though public keys look the same, the private key is different`)
                      console.error(`[Notification] 🔴 The FCM validates JWT signatures, so if private key doesn't match, it rejects`)
                      console.error(`[Notification] 🔴 SOLUTION: Device MUST unsubscribe and create a COMPLETELY NEW subscription`)
                      console.error(`[Notification] 🔴 IMPORTANT: The plugin must ensure unsubscribe() is called BEFORE subscribe()`)
                    } else {
                      console.warn(`[Notification] ⚠️ Public keys don't match - subscription was created with different keys`)
                      console.warn(`[Notification] ⚠️ SOLUTION: Device must unsubscribe and create a NEW subscription`)
                    }

                    console.warn(`[Notification] ⚠️ EXPLICAÇÃO TÉCNICA:`)
                    console.warn(`[Notification] ⚠️   - Quando uma subscription é criada, o FCM/Chrome vincula o endpoint ao PAR de chaves VAPID (pública + privada)`)
                    console.warn(`[Notification] ⚠️   - Esse vínculo é IMUTÁVEL - não pode ser alterado`)
                    console.warn(`[Notification] ⚠️   - O FCM valida o JWT assinado com a chave privada contra a chave pública original`)
                    console.warn(`[Notification] ⚠️   - Se o PAR de chaves não corresponder ao original, retorna 403`)
                    console.warn(`[Notification] ⚠️   - A única solução é criar uma NOVA subscription (novo endpoint) com o PAR de chaves correto`)
                    console.warn(`[Notification] ⚠️   - DISABLED: Marking device as EXPIRED (commented out for testing)`)

                    // DISABLED FOR TESTING: Mark device as EXPIRED - it needs to re-subscribe with current VAPID keys
                    // try {
                    //   await db
                    //     .update(tables.device)
                    //     .set({
                    //       status: 'EXPIRED',
                    //       updatedAt: new Date().toISOString(),
                    //     })
                    //     .where(eq(tables.device.id, device.id))

                    //   console.log(`[Notification] ✅ Device ${device.id} marked as EXPIRED due to VAPID credentials mismatch`)
                    //   console.log(`[Notification] ✅ Device will need to create new subscription with current VAPID keys`)
                    // } catch (updateError) {
                    //   console.error(`[Notification] ❌ Failed to mark device ${device.id} as EXPIRED:`, updateError)
                    // }

                    // Create delivery log for this failure
                    deliveryLogs.push({
                      notificationId: newNotification[0].id,
                      deviceId: device.id,
                      status: 'FAILED' as const,
                      errorMessage: `403 VAPID credentials mismatch: ${result.error}`,
                      sentAt: null,
                    })

                    totalFailed++
                    // Skip to next device - don't continue processing this one
                    continue
                  }
                }

                // Create delivery log (skip if 410 or 403 - already created above)
                if (result.statusCode !== 410 && result.statusCode !== 403) {
                  if (!result.success) {
                    totalFailed++
                  }
                  deliveryLogs.push({
                    notificationId: newNotification[0].id,
                    deviceId: device.id,
                    status: result.success ? ('SENT' as const) : ('FAILED' as const),
                    errorMessage: result.error,
                    providerResponse: { messageId: result.messageId },
                    sentAt: result.success ? new Date().toISOString() : null,
                  })
                }
              } catch (deviceError) {
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
          } catch (providerError) {
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
      }

      // Insert delivery logs (use onConflictDoUpdate to handle duplicates)
      if (deliveryLogs.length > 0) {
        try {
          await db
            .insert(tables.deliveryLog)
            .values(deliveryLogs)
            .onConflictDoUpdate({
              target: [tables.deliveryLog.notificationId, tables.deliveryLog.deviceId],
              set: {
                status: sql`excluded.status`,
                errorMessage: sql`excluded."errorMessage"`,
                providerResponse: sql`excluded."providerResponse"`,
                sentAt: sql`excluded."sentAt"`,
                updatedAt: new Date().toISOString(),
              },
            })
        } catch (insertError) {
          console.error('[Notification] Error inserting delivery logs:', insertError)
          // Try individual inserts as fallback
          for (const log of deliveryLogs) {
            try {
              await db
                .insert(tables.deliveryLog)
                .values(log)
                .onConflictDoUpdate({
                  target: [tables.deliveryLog.notificationId, tables.deliveryLog.deviceId],
                  set: {
                    status: sql`excluded.status`,
                    errorMessage: sql`excluded."errorMessage"`,
                    providerResponse: sql`excluded."providerResponse"`,
                    sentAt: sql`excluded."sentAt"`,
                    updatedAt: new Date().toISOString(),
                  },
                })
            } catch (individualError) {
              console.error(`[Notification] Failed to insert delivery log for device ${log.deviceId}:`, individualError)
            }
          }
        }
      }

      // Count delivered: For Web Push, 'SENT' means delivered (no callback available)
      // For FCM/APNs, 'SENT' is initial confirmation, will be updated to 'DELIVERED' via callback
      const totalDelivered = deliveryLogs.filter(log => log.status === 'SENT').length

      // Update notification statistics
      // Only update to 'SENT' if we actually sent (not scheduled and had devices)
      // If scheduled, keep as 'SCHEDULED'. If no devices, keep as 'PENDING'.
      const shouldMarkAsSent = !input.scheduledAt && targetDevices.length > 0
      await db
        .update(tables.notification)
        .set({
          totalSent,
          totalDelivered,
          totalFailed,
          status: shouldMarkAsSent ? 'SENT' : (input.scheduledAt ? 'SCHEDULED' : 'PENDING'),
          sentAt: shouldMarkAsSent ? new Date().toISOString() : null,
        })
        .where(eq(tables.notification.id, newNotification[0].id))

      // Get updated notification with correct totals
      const updatedNotificationResult = await db
        .select()
        .from(tables.notification)
        .where(eq(tables.notification.id, newNotification[0].id))
        .limit(1)

      if (!updatedNotificationResult[0]) {
        throw createError({
          statusCode: 500,
          message: 'Failed to retrieve updated notification',
        })
      }

      // TypeScript assertion: we've verified it exists above
      const notification = updatedNotificationResult[0]!

      return {
        ...notification,
        totalTargets: targetDevices.length,
      }
    },
  },
})
