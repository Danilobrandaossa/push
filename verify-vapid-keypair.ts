#!/usr/bin/env bun
/**
 * Script para verificar se o par de chaves VAPID está correto
 * Verifica se a chave privada corresponde à chave pública
 */

const crypto = await import('node:crypto')
const jwtModule = await import('jsonwebtoken')
const jwt = jwtModule.default || jwtModule

const PUBLIC_KEY = 'BBseA5iUkM9CR6D--p_fpploFEtGqlib4MGgHiRCmFEeVKj9QDtSbZB2LMhDeylbS7YdrOcJCQ1PQcIbg8HF3Os'

async function verifyKeyPair(publicKey: string, privateKey: string) {
  try {
    console.log('🔍 Verificando par de chaves VAPID...\n')
    
    // Normalize keys
    const normalizedPublicKey = publicKey.replace(/\s+/g, '')
    const normalizedPrivateKey = privateKey.replace(/\s+/g, '')
    
    console.log('Public Key:', normalizedPublicKey)
    console.log('Private Key:', normalizedPrivateKey.substring(0, 50) + '...\n')
    
    // Decode private key
    let privateKeyBuffer: Buffer
    if (normalizedPrivateKey.includes('-') || normalizedPrivateKey.includes('_')) {
      console.log('Detectado formato base64url')
      privateKeyBuffer = Buffer.from(normalizedPrivateKey, 'base64url')
    } else if (normalizedPrivateKey.includes('+') || normalizedPrivateKey.includes('/')) {
      console.log('Detectado formato base64')
      privateKeyBuffer = Buffer.from(normalizedPrivateKey, 'base64')
    } else {
      console.log('Tentando base64url primeiro')
      try {
        privateKeyBuffer = Buffer.from(normalizedPrivateKey, 'base64url')
      } catch {
        privateKeyBuffer = Buffer.from(normalizedPrivateKey, 'base64')
      }
    }
    
    console.log(`Private key buffer length: ${privateKeyBuffer.length} bytes\n`)
    
    // Import private key
    let privateKeyObj: any
    if (privateKeyBuffer.length === 32) {
      console.log('Chave privada é formato raw (32 bytes)')
      // Raw EC private key
      const publicKeyBuffer = Buffer.from(normalizedPublicKey, 'base64url')
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
      console.log('Chave privada é formato PKCS#8 DER')
      privateKeyObj = crypto.createPrivateKey({
        key: privateKeyBuffer,
        format: 'der',
        type: 'pkcs8',
      })
    }
    
    // Export as PEM
    const privateKeyPem = privateKeyObj.export({ type: 'pkcs8', format: 'pem' }) as string
    console.log('✅ Chave privada convertida para PEM com sucesso\n')
    
    // Generate public key from private key
    const publicKeyFromPrivate = crypto.createPublicKey(privateKeyObj)
    const publicKeyDer = publicKeyFromPrivate.export({ type: 'spki', format: 'der' }) as Buffer
    const rawPublicKey = publicKeyDer.slice(-65) // Last 65 bytes
    const publicKeyBase64url = rawPublicKey.toString('base64url')
    
    console.log('Public Key do banco:', normalizedPublicKey)
    console.log('Public Key gerada da private:', publicKeyBase64url)
    
    if (normalizedPublicKey === publicKeyBase64url) {
      console.log('✅✅✅ CHAVES CORRESPONDEM!\n')
    } else {
      console.log('❌❌❌ CHAVES NÃO CORRESPONDEM!\n')
      console.log('Isso significa que a chave privada não corresponde à chave pública!')
      return false
    }
    
    // Test JWT signing
    console.log('Testando assinatura JWT...')
    const testPayload = {
      aud: 'https://fcm.googleapis.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: 'https://amucc.com.br/',
    }
    
    const token = jwt.sign(testPayload, privateKeyPem, { algorithm: 'ES256' })
    console.log('✅ JWT assinado com sucesso')
    console.log('Token preview:', token.substring(0, 50) + '...\n')
    
    return true
  } catch (error) {
    console.error('❌ Erro:', error)
    if (error instanceof Error) {
      console.error('Mensagem:', error.message)
      console.error('Stack:', error.stack)
    }
    return false
  }
}

// Get private key from database
async function getPrivateKeyFromDB() {
  try {
    const { getDatabase } = await import('./server/database/connection')
    const { app } = await import('./server/database/schema')
    const { eq } = await import('drizzle-orm')
    const { isDataEncrypted, decryptSensitiveData } = await import('./server/utils/crypto')
    
    const db = getDatabase()
    const APP_ID = '019b31d9-9046-766d-8170-05a47332f4fe'
    
    const appResult = await db
      .select()
      .from(app)
      .where(eq(app.id, APP_ID))
      .limit(1)
    
    if (appResult.length === 0) {
      throw new Error('App não encontrado')
    }
    
    const appData = appResult[0]
    let privateKey = appData.vapidPrivateKey
    
    if (isDataEncrypted(privateKey)) {
      console.log('Chave privada está criptografada, descriptografando...')
      if (!process.env.ENCRYPTION_KEY) {
        throw new Error('ENCRYPTION_KEY não configurada')
      }
      privateKey = decryptSensitiveData(privateKey)
      console.log('✅ Chave descriptografada\n')
    } else {
      console.log('Chave privada não está criptografada\n')
    }
    
    return privateKey
  } catch (error) {
    console.error('Erro ao buscar chave do banco:', error)
    throw error
  }
}

// Main
try {
  const privateKey = await getPrivateKeyFromDB()
  const isValid = await verifyKeyPair(PUBLIC_KEY, privateKey)
  
  if (isValid) {
    console.log('✅✅✅ VERIFICAÇÃO PASSOU - As chaves estão corretas!')
    process.exit(0)
  } else {
    console.log('❌❌❌ VERIFICAÇÃO FALHOU - As chaves não correspondem!')
    process.exit(1)
  }
} catch (error) {
  console.error('Erro fatal:', error)
  process.exit(1)
}

