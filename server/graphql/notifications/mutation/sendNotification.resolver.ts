import { and, eq, inArray, ne, desc } from 'drizzle-orm'
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
                  const keysMatch = currentVapidPublicKey === deviceVapidKey

                  if (!keysMatch) {
                    console.warn(`[Notification] ⚠️ PRE-VALIDATION FAILED: Device ${device.id} VAPID mismatch detected`)
                    console.warn(`[Notification] ⚠️   - Key at registration: ${deviceVapidKey.substring(0, 50)}... (length: ${deviceVapidKey.length})`)
                    console.warn(`[Notification] ⚠️   - Current key in app: ${currentVapidPublicKey.substring(0, 50)}... (length: ${currentVapidPublicKey.length})`)
                    console.warn(`[Notification] ⚠️   - This device will fail with 403 - marking as EXPIRED and skipping`)

                    // Mark as EXPIRED before attempting to send (prevents wasted API calls and 403 errors)
                    try {
                      await db
                        .update(tables.device)
                        .set({
                          status: 'EXPIRED',
                          updatedAt: new Date().toISOString(),
                        })
                        .where(eq(tables.device.id, device.id))
                      console.log(`[Notification] ✅ Device ${device.id} pre-validated and marked as EXPIRED - skipping send`)

                      totalFailed++
                      deliveryLogs.push({
                        notificationId: newNotification[0].id,
                        deviceId: device.id,
                        status: 'FAILED' as const,
                        errorMessage: 'VAPID key mismatch: Device registered with different VAPID key. Device needs to re-subscribe with current VAPID keys.',
                        sentAt: null,
                      })
                      continue // Skip this device, don't attempt to send
                    } catch (updateError) {
                      console.error(`[Notification] Failed to mark device ${device.id} as expired in pre-validation:`, updateError)
                      // Continue to attempt send (will fail with 403, then be marked as expired)
                    }
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

                  // 🔴 CRITICAL: 410 Gone = MORTE DEFINITIVA
                  // Subscription expirou ou foi cancelada - endpoint não existe mais no FCM
                  // NUNCA retentar - deletar device imediatamente
                  if (result.statusCode === 410) {
                    console.error(`[Notification] 🔴 CRITICAL: Device ${device.id} subscription expired (410 Gone) - DELETING DEVICE IMMEDIATELY`)
                    console.error(`[Notification] 🔴 Subscription endpoint: ${device.token.substring(0, 50)}...`)
                    console.error(`[Notification] 🔴 410 = morte definitiva - subscription não existe mais no FCM`)
                    console.error(`[Notification] 🔴 Device será deletado - NUNCA retentar envio para este device`)

                    // Criar delivery log antes de deletar (para histórico)
                    deliveryLogs.push({
                      notificationId: newNotification[0].id,
                      deviceId: device.id,
                      status: 'FAILED' as const,
                      errorMessage: '410 Gone: Subscription expired or unsubscribed. Device deleted permanently. Never retry.',
                      sentAt: null,
                    })

                    try {
                      // Deletar device imediatamente - 410 é morte definitiva
                      await db
                        .delete(tables.device)
                        .where(eq(tables.device.id, device.id))

                      console.log(`[Notification] ✅ Device ${device.id} deletado permanentemente devido a 410 Gone`)
                      console.log(`[Notification] ✅ Este device nunca mais será incluído em envios futuros`)

                      // Pular para próximo device (continue)
                      continue
                    } catch (deleteError) {
                      console.error(`[Notification] ❌ ERRO ao deletar device ${device.id}:`, deleteError)
                      // Mesmo com erro, o delivery log já foi criado acima
                      // Pular para próximo device
                      continue
                    }
                  }
                  // If VAPID credentials mismatch (403), log detailed warning but continue trying
                  // (Temporarily disabled marking as EXPIRED for testing purposes)
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

                    // Mark device as EXPIRED to force client to create new subscription
                    try {
                      await db
                        .update(tables.device)
                        .set({
                          status: 'EXPIRED',
                          updatedAt: new Date().toISOString(),
                        })
                        .where(eq(tables.device.id, device.id))
                      console.log(`[Notification] Device ${device.id} marked as EXPIRED due to VAPID mismatch - client will need to create new subscription`)
                    } catch (updateError) {
                      console.error(`[Notification] Failed to mark device ${device.id} as expired:`, updateError)
                    }
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

                // Create delivery log (skip if 410 - already created above before deletion)
                if (result.statusCode !== 410) {
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

      // Insert delivery logs
      if (deliveryLogs.length > 0) {
        await db.insert(tables.deliveryLog).values(deliveryLogs)
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
