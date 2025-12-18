import { eq } from 'drizzle-orm'
import { defineMutation } from 'nitro-graphql/utils/define'
import { getHeader } from 'h3'
import { processSubscriptionAutomations } from '~~/server/utils/automation'

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
      
      // Use upsert with ON CONFLICT to handle unique constraint
      console.log('[RegisterDevice] Registering device with status ACTIVE', {
        appId: input.appId,
        platform: input.platform,
        tokenPreview: cleanToken.substring(0, 50) + '...',
        hasWebPushKeys: !!(input.webPushP256dh && input.webPushAuth),
        vapidPublicKeyUsed: vapidPublicKeyUsed ? vapidPublicKeyUsed.substring(0, 30) + '...' : 'null'
      })
      
      const device = await db
        .insert(tables.device)
        .values({
          appId: input.appId,
          token: cleanToken,
          category: input.category,
          platform: input.platform,
          status: 'ACTIVE',
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
            status: 'ACTIVE', // Always set to ACTIVE on update
            lastSeenAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        })
        .returning()

      const registeredDevice = device[0]
      
      console.log('[RegisterDevice] Device registered successfully', {
        id: registeredDevice.id,
        status: registeredDevice.status,
        platform: registeredDevice.platform,
        appId: registeredDevice.appId
      })
      
      // Verify status is ACTIVE
      if (registeredDevice.status !== 'ACTIVE') {
        console.error('[RegisterDevice] WARNING: Device registered with incorrect status!', {
          id: registeredDevice.id,
          expected: 'ACTIVE',
          actual: registeredDevice.status
        })
        
        // Force update to ACTIVE
        const correctedDevice = await db
          .update(tables.device)
          .set({
            status: 'ACTIVE',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(tables.device.id, registeredDevice.id))
          .returning()
        
        console.log('[RegisterDevice] Device status corrected to ACTIVE', {
          id: correctedDevice[0].id,
          status: correctedDevice[0].status
        })
        
        return correctedDevice[0]
      }

      // Processar automações de inscrição em background (não bloquear resposta)
      processSubscriptionAutomations(
        input.appId,
        registeredDevice.id,
        db,
        tables,
      ).catch((error) => {
        console.error('[Automation] Error processing subscription automations:', error)
      })

      return registeredDevice
    },
  },
})
