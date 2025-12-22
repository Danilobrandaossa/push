import { eq } from 'drizzle-orm'
import { getDatabase } from '~~/server/database/connection'
import { app } from '~~/server/database/schema'
import { decryptSensitiveData, isDataEncrypted } from '~~/server/utils/crypto'
import { APNsProvider } from './apns'
import { FCMProvider } from './fcm'
import { WebPushProvider } from './webpush'

export interface ProviderResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface BatchProviderResult {
  success: boolean
  results: ProviderResult[]
  successCount: number
  failureCount: number
}

export async function getProviderForApp(appId: string, platform: 'ios' | 'android' | 'web') {
  const db = getDatabase()

  const appResult = await db
    .select()
    .from(app)
    .where(eq(app.id, appId))
    .limit(1)

  if (appResult.length === 0) {
    throw new Error('App not found')
  }

  const appData = appResult[0]!

  switch (platform) {
    case 'android': {
      // Use FCM for Android
      if (!appData.fcmProjectId || !appData.fcmServerKey) {
        throw new Error('FCM not configured for this app (missing project ID or server key)')
      }

      // Decrypt the service account key if it's encrypted
      let serviceAccountKey: string
      const isEncrypted = isDataEncrypted(appData.fcmServerKey)

      if (isEncrypted) {
        if (!process.env.ENCRYPTION_KEY) {
          console.warn('[Provider] FCM service account appears encrypted but ENCRYPTION_KEY not set - using as-is (assuming unencrypted)')
          serviceAccountKey = appData.fcmServerKey
        } else {
          try {
            serviceAccountKey = decryptSensitiveData(appData.fcmServerKey)
          } catch (decryptError) {
            const errorMsg = decryptError instanceof Error ? decryptError.message : 'Unknown decryption error'
            if (errorMsg.includes('ENCRYPTION_KEY')) {
              console.warn('[Provider] FCM decryption failed (ENCRYPTION_KEY issue) - using key as-is (assuming unencrypted)')
              serviceAccountKey = appData.fcmServerKey
            } else {
              throw new Error(`Failed to decrypt FCM service account: ${errorMsg}`)
            }
          }
        }
      } else {
        serviceAccountKey = appData.fcmServerKey
      }

      return new FCMProvider({
        projectId: appData.fcmProjectId,
        serviceAccountKey,
      })
    }

    case 'ios': {
      // Use APNs for iOS
      if (!appData.apnsKeyId || !appData.apnsTeamId || !appData.apnsCertificate) {
        throw new Error('APNs not configured for this app (missing key ID, team ID, or certificate)')
      }

      // Decrypt the private key if it's encrypted
      let privateKey: string
      const isEncrypted = isDataEncrypted(appData.apnsCertificate)

      if (isEncrypted) {
        if (!process.env.ENCRYPTION_KEY) {
          console.warn('[Provider] APNS private key appears encrypted but ENCRYPTION_KEY not set - using as-is (assuming unencrypted)')
          privateKey = appData.apnsCertificate
        } else {
          try {
            privateKey = decryptSensitiveData(appData.apnsCertificate)
          } catch (decryptError) {
            const errorMsg = decryptError instanceof Error ? decryptError.message : 'Unknown decryption error'
            if (errorMsg.includes('ENCRYPTION_KEY')) {
              console.warn('[Provider] APNS decryption failed (ENCRYPTION_KEY issue) - using key as-is (assuming unencrypted)')
              privateKey = appData.apnsCertificate
            } else {
              throw new Error(`Failed to decrypt APNS private key: ${errorMsg}`)
            }
          }
        }
      } else {
        privateKey = appData.apnsCertificate
      }

      if (!appData.bundleId) {
        throw new Error('iOS Bundle ID not configured for this app')
      }

      return new APNsProvider({
        keyId: appData.apnsKeyId,
        teamId: appData.apnsTeamId,
        bundleId: appData.bundleId,
        privateKey,
        production: process.env.NODE_ENV === 'production',
      })
    }

    case 'web': {
      // Use Web Push
      if (!appData.vapidPublicKey || !appData.vapidPrivateKey || !appData.vapidSubject) {
        throw new Error('Web Push not configured for this app (missing VAPID keys or subject)')
      }

      // Decrypt the private key if it's encrypted, otherwise use directly
      let vapidPrivateKey: string
      const isEncrypted = isDataEncrypted(appData.vapidPrivateKey)

      if (isEncrypted) {
        // Key appears to be encrypted - try to decrypt
        if (!process.env.ENCRYPTION_KEY) {
          // No ENCRYPTION_KEY available - assume key is actually unencrypted (stored before encryption was enabled)
          console.warn('[Provider] VAPID private key appears encrypted but ENCRYPTION_KEY not set - using as-is (assuming unencrypted)')
          vapidPrivateKey = appData.vapidPrivateKey
        } else {
          try {
            vapidPrivateKey = decryptSensitiveData(appData.vapidPrivateKey)
          } catch (decryptError) {
            const errorMsg = decryptError instanceof Error ? decryptError.message : 'Unknown decryption error'
            // If decryption fails and it's an ENCRYPTION_KEY error, assume key is unencrypted
            if (errorMsg.includes('ENCRYPTION_KEY')) {
              console.warn('[Provider] Decryption failed (ENCRYPTION_KEY issue) - using key as-is (assuming unencrypted)')
              vapidPrivateKey = appData.vapidPrivateKey
            } else {
              throw new Error(`Failed to decrypt VAPID private key: ${errorMsg}. Please verify ENCRYPTION_KEY is correct.`)
            }
          }
        }
      } else {
        // Key is not encrypted, use directly
        vapidPrivateKey = appData.vapidPrivateKey
      }

      // Normalize VAPID keys (remove any whitespace)
      const normalizedPublicKey = appData.vapidPublicKey.replace(/\s+/g, '')
      const normalizedPrivateKey = vapidPrivateKey.replace(/\s+/g, '')

      // Log full public key for debugging
      console.log('[Provider] Creating WebPush provider with VAPID keys:', {
        appId,
        subject: appData.vapidSubject,
        publicKeyFull: normalizedPublicKey, // Log full key for comparison
        publicKeyPreview: normalizedPublicKey.substring(0, 50) + '...',
        publicKeyLength: normalizedPublicKey.length,
        publicKeyOriginalLength: appData.vapidPublicKey.length,
        wasPublicKeyNormalized: normalizedPublicKey !== appData.vapidPublicKey,
        publicKeyFirstChar: normalizedPublicKey.charAt(0),
        publicKeyLastChar: normalizedPublicKey.charAt(normalizedPublicKey.length - 1),
        privateKeyPreview: normalizedPrivateKey.substring(0, 30) + '...',
        privateKeyLength: normalizedPrivateKey.length,
        privateKeyOriginalLength: vapidPrivateKey.length,
        wasPrivateKeyNormalized: normalizedPrivateKey !== vapidPrivateKey,
        hasPrivateKey: !!normalizedPrivateKey
      })

      return new WebPushProvider({
        vapidSubject: appData.vapidSubject,
        publicKey: normalizedPublicKey,
        privateKey: normalizedPrivateKey,
      })
    }

    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }
}
