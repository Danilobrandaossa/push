import { eq } from 'drizzle-orm'
import { defineMutation } from 'nitro-graphql/utils/define'
import { getHeader } from 'h3'
import { processSubscriptionAutomations } from '~~/server/utils/automation'
import { getProviderForApp } from '~~/server/providers'

// Helper function to get client IP
function getClientIP(event: any): string | null {
  // Check various headers for client IP
  const forwardedFor = getHeader(event, 'x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }

  const realIP = getHeader(event, 'x-real-ip')
  if (realIP) {
    return realIP
  }

  const cfConnectingIP = getHeader(event, 'cf-connecting-ip') // Cloudflare
  if (cfConnectingIP) {
    return cfConnectingIP
  }

  // Fallback to remote address
  return event.node?.req?.socket?.remoteAddress || null
}

export const registerDeviceMutation = defineMutation({
  registerDevice: {
    resolve: async (_parent, { input }, { context }) => {
      const { useDatabase, tables } = context
      const db = useDatabase()

      // Get client IP if userId is not provided
      let userId = input.userId
      if (!userId && context.event) {
        userId = getClientIP(context.event) || 'unknown'
        console.log('[RegisterDevice] Using client IP as userId:', userId)
      }

      // Validate and clean push token based on platform
      let cleanToken = input.token.trim()

      // Remove any spaces from the token (common copy/paste issue)
      cleanToken = cleanToken.replace(/\s+/g, '')

      // Platform-specific token validation
      if (input.platform === 'IOS') {
        // APNS token validation (64 characters, hex string)
        if (cleanToken.length !== 64) {
          throw createError({
            statusCode: 400,
            message: `Invalid APNS token length: ${cleanToken.length}. Expected 64 characters.`,
          })
        }

        // APNS tokens are hex strings
        if (!/^[0-9a-f]+$/i.test(cleanToken)) {
          throw createError({
            statusCode: 400,
            message: 'Invalid APNS token format. Token should be a 64-character hex string.',
          })
        }
      }
      else if (input.platform === 'ANDROID') {
        // FCM token validation for Android
        if (cleanToken.length < 140 || cleanToken.length > 200) {
          throw createError({
            statusCode: 400,
            message: `Invalid FCM token length: ${cleanToken.length}. Expected 140-200 characters.`,
          })
        }

        // FCM tokens should not contain spaces or special characters except - and _
        if (!/^[\w-]+$/.test(cleanToken)) {
          throw createError({
            statusCode: 400,
            message: 'Invalid FCM token format. Token contains invalid characters.',
          })
        }
      }
      else if (input.platform === 'WEB') {
        // Web push endpoint validation - should be a valid URL
        try {
          const url = new URL(cleanToken)
          if (!['http:', 'https:'].includes(url.protocol)) {
            throw createError({
              statusCode: 400,
              message: 'Web push endpoint must be a valid HTTP/HTTPS URL.',
            })
          }
        }
        catch {
          throw createError({
            statusCode: 400,
            message: 'Invalid web push endpoint URL format.',
          })
        }

        // WebPush subscription keys are required for Web platform
        if (!input.webPushP256dh || !input.webPushAuth) {
          throw createError({
            statusCode: 400,
            message: 'WebPush subscription requires p256dh and auth keys for encryption.',
          })
        }
      }

      // Get current VAPID public key from app (to store which key was used for registration)
      const app = await db
        .select({ vapidPublicKey: tables.app.vapidPublicKey })
        .from(tables.app)
        .where(eq(tables.app.id, input.appId))
        .limit(1)

      const vapidPublicKeyUsed = app[0]?.vapidPublicKey || null

      // 🔒 MOBILE-SAFE: For WEB platform, create device as PENDING initially
      // Will be marked ACTIVE only after warm-up push succeeds
      // This prevents "natimortos" devices that fail on first real push
      const initialStatus = (input.platform === 'WEB') ? 'PENDING' : 'ACTIVE'

      console.log(`[RegisterDevice] Registering device with status ${initialStatus}`, {
        appId: input.appId,
        platform: input.platform,
        platformType: typeof input.platform,
        platformEquality: input.platform === 'WEB',
        initialStatus,
        tokenPreview: cleanToken.substring(0, 50) + '...',
        hasWebPushKeys: !!(input.webPushP256dh && input.webPushAuth),
        vapidPublicKeyUsed: vapidPublicKeyUsed ? vapidPublicKeyUsed.substring(0, 30) + '...' : 'null',
        willDoWarmUpPush: input.platform === 'WEB'
      })

      const device = await db
        .insert(tables.device)
        .values({
          appId: input.appId,
          token: cleanToken,
          category: input.category,
          platform: input.platform,
          status: initialStatus,
          userId: userId, // Use IP if userId not provided
          metadata: input.metadata,
          webPushP256dh: input.webPushP256dh,
          webPushAuth: input.webPushAuth,
          vapidPublicKeyUsed: vapidPublicKeyUsed, // Store VAPID key used for registration
          lastSeenAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: [tables.device.appId, tables.device.token, tables.device.userId],
          set: {
            category: input.category,
            metadata: input.metadata,
            webPushP256dh: input.webPushP256dh,
            webPushAuth: input.webPushAuth,
            vapidPublicKeyUsed: vapidPublicKeyUsed, // Update VAPID key used
            status: initialStatus, // Use initial status (PENDING for WEB, ACTIVE for others)
            lastSeenAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        })
        .returning()

      const registeredDevice = device[0]

      console.log('[RegisterDevice] Device registered successfully', {
        id: registeredDevice.id,
        status: registeredDevice.status,
        expectedStatus: initialStatus,
        statusMatch: registeredDevice.status === initialStatus,
        platform: registeredDevice.platform,
        appId: registeredDevice.appId
      })

      // Sanity check: ensure status matches what we set
      if (registeredDevice.status !== initialStatus) {
        console.warn(`[RegisterDevice] ⚠️ Status mismatch! Expected ${initialStatus}, got ${registeredDevice.status}`)
      }

      // 🔒 MOBILE-SAFE: Warm-up push for WEB platform devices
      // Validate subscription before marking as ACTIVE - prevents "natimortos"
      if (input.platform === 'WEB' && input.webPushP256dh && input.webPushAuth) {
        console.log('[RegisterDevice] 🔒 MOBILE-SAFE: Sending warm-up push to validate subscription...')

        try {
          const provider = await getProviderForApp(input.appId, 'web')
          const warmUpMessage = (provider as any).convertNotificationPayload(
            {
              title: '', // Empty title = silent push (warm-up)
              body: '',
              data: { type: 'warmup', silent: true, deviceId: registeredDevice.id },
            },
            {
              endpoint: cleanToken,
              keys: {
                p256dh: input.webPushP256dh,
                auth: input.webPushAuth,
              },
            },
            null, // No notification ID for warm-up
            registeredDevice.id,
          )

          const result = await (provider as any).sendMessage(warmUpMessage)

          if (result.success) {
            // Warm-up push succeeded - mark device as ACTIVE
            console.log('[RegisterDevice] ✅ Warm-up push succeeded - marking device as ACTIVE')
            const activatedDevice = await db
              .update(tables.device)
              .set({
                status: 'ACTIVE',
                updatedAt: new Date().toISOString(),
              })
              .where(eq(tables.device.id, registeredDevice.id))
              .returning()

            console.log('[RegisterDevice] Device activated after successful warm-up push', {
              id: activatedDevice[0].id,
              status: activatedDevice[0].status
            })

            // Process automations after activation
            processSubscriptionAutomations(
              input.appId,
              activatedDevice[0].id,
              db,
              tables,
            ).catch((error) => {
              console.error('[Automation] Error processing subscription automations:', error)
            })

            return activatedDevice[0]
          } else {
            // Warm-up push failed - delete device (410/403 = subscription invalid)
            console.error('[RegisterDevice] ❌ Warm-up push failed - deleting device (subscription invalid)', {
              error: result.error,
              statusCode: result.statusCode
            })

            await db
              .delete(tables.device)
              .where(eq(tables.device.id, registeredDevice.id))

            console.log('[RegisterDevice] Device deleted - subscription invalid (410/403 during warm-up)')

            // Still return the device object (it was deleted, but return original for client)
            // Client should handle deletion and retry registration
            return registeredDevice
          }
        } catch (warmUpError) {
          const errorMessage = warmUpError instanceof Error ? warmUpError.message : 'Unknown error'

          // Special handling for encryption key errors
          // If the private key is encrypted but ENCRYPTION_KEY is missing, we cannot send push notifications
          // In this case, mark device as ACTIVE but log a warning - push notifications will fail until ENCRYPTION_KEY is set
          if (errorMessage.includes('ENCRYPTION_KEY') || errorMessage.includes('encrypted in database')) {
            console.warn('[RegisterDevice] ⚠️ ENCRYPTION_KEY missing during warm-up push', {
              error: errorMessage,
              deviceId: registeredDevice.id,
              note: 'Marking device as ACTIVE - will be validated on first real push. Ensure ENCRYPTION_KEY is set if using encrypted keys.'
            })

            // Mark as ACTIVE - assume the private key is already decrypted or will work
            // NOTE: This device will fail on first push if ENCRYPTION_KEY is not set
            // The device is marked ACTIVE to allow registration to complete, but push notifications
            // will fail until ENCRYPTION_KEY is properly configured
            const activatedDevice = await db
              .update(tables.device)
              .set({
                status: 'ACTIVE',
                updatedAt: new Date().toISOString(),
              })
              .where(eq(tables.device.id, registeredDevice.id))
              .returning()

            console.log('[RegisterDevice] ✅ Device marked as ACTIVE despite ENCRYPTION_KEY error', {
              id: activatedDevice[0].id,
              status: activatedDevice[0].status,
              warning: 'Push notifications will fail until ENCRYPTION_KEY is set in environment'
            })

            // Process automations after activation
            processSubscriptionAutomations(
              input.appId,
              activatedDevice[0].id,
              db,
              tables,
            ).catch((error) => {
              console.error('[Automation] Error processing subscription automations:', error)
            })

            return activatedDevice[0]
          }

          // Other errors during warm-up - log but don't fail registration
          // Device remains PENDING - will be validated on next real push
          console.error('[RegisterDevice] ⚠️ Error during warm-up push - device remains PENDING', {
            error: errorMessage,
            deviceId: registeredDevice.id
          })

          // Device stays as PENDING - will be validated later
          return registeredDevice
        }
      } else {
        // Non-WEB platform or missing keys - mark as ACTIVE immediately
        if (registeredDevice.status !== 'ACTIVE') {
          const activatedDevice = await db
            .update(tables.device)
            .set({
              status: 'ACTIVE',
              updatedAt: new Date().toISOString(),
            })
            .where(eq(tables.device.id, registeredDevice.id))
            .returning()

          return activatedDevice[0]
        }

        // Process automations
        processSubscriptionAutomations(
          input.appId,
          registeredDevice.id,
          db,
          tables,
        ).catch((error) => {
          console.error('[Automation] Error processing subscription automations:', error)
        })

        return registeredDevice
      }
    },
  },
})
