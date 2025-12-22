#!/usr/bin/env bun
/**
 * Script para atualizar chaves VAPID no backend
 * Uso: bun server/scripts/update-vapid-keys.ts <PRIVATE_KEY>
 */

import { getDatabase } from '../database/connection'
import { app } from '../database/schema/app'
import { eq } from 'drizzle-orm'
import { encryptSensitiveData, decryptSensitiveData } from '../utils/crypto'

const APP_ID = '019b31d9-9046-766d-8170-05a47332f4fe'
const VAPID_PUBLIC_KEY = 'BBseA5iUkM9CR6D--p_fpploFEtGqlib4MGgHiRCmFEeVKj9QDtSbZB2LMhDeylbS7YdrOcJCQ1PQcIbg8HF3Os'
const VAPID_SUBJECT = 'https://amucc.com.br/'

async function updateVapidKeys(privateKey: string) {
  try {
    const db = getDatabase()

    // Normalize keys
    const normalizedPublicKey = VAPID_PUBLIC_KEY.replace(/\s+/g, '')
    const normalizedPrivateKey = privateKey.replace(/\s+/g, '')

    console.log('Atualizando chaves VAPID...')
    console.log('Public Key:', normalizedPublicKey.substring(0, 50) + '...')
    console.log('Private Key:', normalizedPrivateKey.substring(0, 50) + '...')

    // Encrypt private key (or store unencrypted if ENCRYPTION_KEY issues)
    let encryptedPrivateKey: string
    const FORCE_UNENCRYPTED = process.env.FORCE_UNENCRYPTED === 'true'

    if (FORCE_UNENCRYPTED) {
      console.log('⚠️ FORCE_UNENCRYPTED=true - armazenando chave privada SEM criptografia')
      encryptedPrivateKey = normalizedPrivateKey
    } else {
      try {
        // Test decryption before storing to ensure it works
        const testEncrypted = encryptSensitiveData(normalizedPrivateKey)
        const testDecrypted = decryptSensitiveData(testEncrypted)
        if (testDecrypted !== normalizedPrivateKey) {
          throw new Error('Encryption test failed: decrypted key does not match original')
        }
        encryptedPrivateKey = testEncrypted
        console.log('✅ Chave privada criptografada com sucesso (teste de descriptografia passou)')
      } catch (encryptError) {
        const errorMsg = encryptError instanceof Error ? encryptError.message : 'Unknown error'
        console.warn('⚠️ Erro ao criptografar, armazenando sem criptografia:', errorMsg)
        encryptedPrivateKey = normalizedPrivateKey
      }
    }

    // Update app
    const result = await db
      .update(app)
      .set({
        vapidSubject: VAPID_SUBJECT,
        vapidPublicKey: normalizedPublicKey,
        vapidPrivateKey: encryptedPrivateKey,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(app.id, APP_ID))
      .returning()

    if (result.length === 0) {
      throw new Error('App não encontrado')
    }

    console.log('✅✅✅ Chaves VAPID atualizadas com sucesso!')
    console.log('App ID:', result[0].id)
    console.log('Public Key:', result[0].vapidPublicKey?.substring(0, 50) + '...')

    return result[0]
  } catch (error) {
    console.error('❌ Erro ao atualizar chaves VAPID:', error)
    throw error
  }
}

// Get private key from command line argument
const privateKey = process.argv[2]

if (!privateKey) {
  console.error('❌ Erro: Chave privada não fornecida')
  console.log('Uso: bun server/scripts/update-vapid-keys.ts <PRIVATE_KEY>')
  process.exit(1)
}

updateVapidKeys(privateKey)
  .then(() => {
    console.log('✅ Script concluído com sucesso')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script falhou:', error)
    process.exit(1)
  })

