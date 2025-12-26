#!/usr/bin/env bun
/**
 * Script para verificar e corrigir chaves VAPID no banco
 * Mantém a mesma chave pública, verifica se a privada corresponde
 */

import { getDatabase } from '../database/connection'
import { app } from '../database/schema/app'
import { eq } from 'drizzle-orm'
import { encryptSensitiveData, decryptSensitiveData, isDataEncrypted } from '../utils/crypto'

const APP_ID = '019b31d9-9046-766d-8170-05a47332f4fe'
const VAPID_PUBLIC_KEY = 'BBseA5iUkM9CR6D--p_fpploFEtGqlib4MGgHiRCmFEeVKj9QDtSbZB2LMhDeylbS7YdrOcJCQ1PQcIbg8HF3Os'
const VAPID_SUBJECT = 'https://amucc.com.br/'

async function verifyKeyPair(publicKey: string, privateKey: string): Promise<boolean> {
  try {
    const crypto = await import('node:crypto')

    // Normalize keys
    const normalizedPublicKey = publicKey.replace(/\s+/g, '')
    const normalizedPrivateKey = privateKey.replace(/\s+/g, '')

    // Try to decode and use the private key
    let privateKeyBuffer: Buffer
    if (normalizedPrivateKey.includes('-') || normalizedPrivateKey.includes('_')) {
      privateKeyBuffer = Buffer.from(normalizedPrivateKey, 'base64url')
    } else if (normalizedPrivateKey.includes('+') || normalizedPrivateKey.includes('/')) {
      privateKeyBuffer = Buffer.from(normalizedPrivateKey, 'base64')
    } else {
      try {
        privateKeyBuffer = Buffer.from(normalizedPrivateKey, 'base64url')
      } catch {
        privateKeyBuffer = Buffer.from(normalizedPrivateKey, 'base64')
      }
    }

    let privateKeyObj: any
    if (privateKeyBuffer.length === 32) {
      // Raw EC private key - need to convert to JWK
      const publicKeyBuffer = Buffer.from(normalizedPublicKey, 'base64url')
      if (publicKeyBuffer.length !== 65 || publicKeyBuffer[0] !== 0x04) {
        return false
      }
      const x = publicKeyBuffer.slice(1, 33)
      const y = publicKeyBuffer.slice(33, 65)
      const jwk = {
        kty: 'EC',
        crv: 'P-256',
        d: privateKeyBuffer.toString('base64url'),
        x: x.toString('base64url'),
        y: y.toString('base64url'),
      }
      privateKeyObj = crypto.createPrivateKey({ key: jwk, format: 'jwk' })
    } else {
      privateKeyObj = crypto.createPrivateKey({ key: privateKeyBuffer, format: 'der', type: 'pkcs8' })
    }

    // Extract public key from private key
    const extractedPublicKey = crypto.createPublicKey(privateKeyObj)
    const extractedPublicKeyDer = extractedPublicKey.export({ type: 'spki', format: 'der' }) as Buffer
    const rawExtractedPublicKey = extractedPublicKeyDer.slice(-65)
    const extractedPublicKeyBase64url = rawExtractedPublicKey.toString('base64url')

    return extractedPublicKeyBase64url === normalizedPublicKey
  } catch (error) {
    console.error('Erro ao verificar par de chaves:', error)
    return false
  }
}

async function fixVapidKeys() {
  try {
    const db = getDatabase()

    // Get current app data
    const appResult = await db
      .select()
      .from(app)
      .where(eq(app.id, APP_ID))
      .limit(1)

    if (appResult.length === 0) {
      throw new Error('App não encontrado')
    }

    const appData = appResult[0]

    console.log('🔍 Verificando chaves VAPID atuais...')
    console.log('Public Key no banco:', appData.vapidPublicKey?.substring(0, 50) + '...')
    console.log('Public Key esperada:', VAPID_PUBLIC_KEY.substring(0, 50) + '...')

    // Check if public key matches
    const normalizedStoredPublicKey = (appData.vapidPublicKey || '').replace(/\s+/g, '')
    const normalizedExpectedPublicKey = VAPID_PUBLIC_KEY.replace(/\s+/g, '')

    if (normalizedStoredPublicKey !== normalizedExpectedPublicKey) {
      console.warn('⚠️ Chave pública no banco não corresponde à esperada')
      console.warn('Atualizando chave pública...')
    }

    // Get private key (try to decrypt if encrypted)
    let currentPrivateKey: string | null = null
    if (appData.vapidPrivateKey) {
      const isEncrypted = isDataEncrypted(appData.vapidPrivateKey)

      if (isEncrypted) {
        if (process.env.ENCRYPTION_KEY) {
          try {
            currentPrivateKey = decryptSensitiveData(appData.vapidPrivateKey)
            console.log('✅ Chave privada descriptografada do banco')
          } catch (decryptError) {
            console.error('❌ Erro ao descriptografar chave privada:', decryptError)
            console.log('ℹ️ Chave privada precisa ser atualizada')
          }
        } else {
          console.warn('⚠️ ENCRYPTION_KEY não configurada - não é possível descriptografar')
        }
      } else {
        currentPrivateKey = appData.vapidPrivateKey
        console.log('✅ Chave privada não está criptografada')
      }
    }

    // If we have private key, verify it matches public key
    if (currentPrivateKey) {
      console.log('\n🔍 Verificando se chave privada corresponde à chave pública...')
      const isValid = await verifyKeyPair(VAPID_PUBLIC_KEY, currentPrivateKey)

      if (isValid) {
        console.log('✅✅✅ Chaves correspondem! Não é necessário atualizar.')

        // Just update public key if it doesn't match (but private is correct)
        if (normalizedStoredPublicKey !== normalizedExpectedPublicKey) {
          console.log('📝 Atualizando apenas chave pública no banco...')
          await db
            .update(app)
            .set({
              vapidPublicKey: normalizedExpectedPublicKey,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(app.id, APP_ID))
          console.log('✅ Chave pública atualizada')
        }

        return true
      } else {
        console.error('❌ Chave privada NÃO corresponde à chave pública!')
        console.error('❌ A chave privada precisa ser atualizada')
      }
    } else {
      console.warn('⚠️ Não foi possível obter chave privada atual')
    }

    // Need to update private key - ask user to provide it
    console.log('\n❌ A chave privada atual não corresponde à chave pública.')
    console.log('📝 Você precisa fornecer a chave privada correspondente à chave pública:')
    console.log('   ' + VAPID_PUBLIC_KEY)
    console.log('\nPara atualizar, execute:')
    console.log(`   bun server/scripts/update-vapid-keys.ts "<SUA_CHAVE_PRIVADA>"`)

    return false
  } catch (error) {
    console.error('❌ Erro:', error)
    throw error
  }
}

fixVapidKeys()
  .then((success) => {
    if (success) {
      console.log('\n✅✅✅ Processo concluído com sucesso!')
    } else {
      console.log('\n⚠️ Processo concluído, mas chaves precisam ser atualizadas manualmente')
    }
    process.exit(success ? 0 : 1)
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error)
    process.exit(1)
  })



