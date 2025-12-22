#!/usr/bin/env bun
/**
 * Script para verificar se uma chave privada VAPID corresponde a uma chave pública VAPID
 * Uso: bun server/scripts/verify-vapid-keypair.ts <PUBLIC_KEY> <PRIVATE_KEY>
 */

async function verifyVapidKeyPair(publicKey: string, privateKey: string) {
  try {
    const crypto = await import('node:crypto')
    const jwtModule = await import('jsonwebtoken')
    const jwt = jwtModule.default || jwtModule

    // Normalize keys
    const normalizedPublicKey = publicKey.replace(/\s+/g, '')
    const normalizedPrivateKey = privateKey.replace(/\s+/g, '')

    console.log('🔍 Verificando par de chaves VAPID...')
    console.log('Public Key:', normalizedPublicKey.substring(0, 50) + '...')
    console.log('Private Key:', normalizedPrivateKey.substring(0, 50) + '...')

    // Try to decode and use the private key
    let privateKeyBuffer: Buffer
    if (normalizedPrivateKey.includes('-') || normalizedPrivateKey.includes('_')) {
      privateKeyBuffer = Buffer.from(normalizedPrivateKey, 'base64url')
    } else if (normalizedPrivateKey.includes('+') || normalizedPrivateKey.includes('/')) {
      privateKeyBuffer = Buffer.from(normalizedPrivateKey, 'base64')
    } else {
      // Try base64url first
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
        throw new Error('Invalid public key format')
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

    // Export as PEM
    const privateKeyPem = privateKeyObj.export({ type: 'pkcs8', format: 'pem' }) as string

    // Extract public key from private key
    const extractedPublicKey = crypto.createPublicKey(privateKeyObj)
    const extractedPublicKeyDer = extractedPublicKey.export({ type: 'spki', format: 'der' }) as Buffer
    const rawExtractedPublicKey = extractedPublicKeyDer.slice(-65)
    const extractedPublicKeyBase64url = rawExtractedPublicKey.toString('base64url')

    // Compare
    const keysMatch = extractedPublicKeyBase64url === normalizedPublicKey

    console.log('\n📊 Resultado da verificação:')
    console.log('Public Key fornecida:', normalizedPublicKey.substring(0, 50) + '...')
    console.log('Public Key extraída da chave privada:', extractedPublicKeyBase64url.substring(0, 50) + '...')
    console.log('✅ Correspondem?', keysMatch ? 'SIM ✅' : 'NÃO ❌')

    if (!keysMatch) {
      console.error('\n❌ ERRO: As chaves NÃO correspondem!')
      console.error('A chave privada fornecida não corresponde à chave pública.')
      console.error('Isso explicará por que ocorre erro 403 ao enviar notificações.')
      return false
    }

    // Test JWT signing
    console.log('\n🧪 Testando assinatura JWT...')
    const testPayload = {
      aud: 'https://fcm.googleapis.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub: 'https://amucc.com.br/',
    }

    const token = jwt.sign(testPayload, privateKeyPem, { algorithm: 'ES256' })
    console.log('✅ JWT assinado com sucesso:', token.substring(0, 50) + '...')

    console.log('\n✅✅✅ PAR DE CHAVES VÁLIDO!')
    return true
  } catch (error) {
    console.error('❌ Erro ao verificar par de chaves:', error)
    return false
  }
}

const publicKey = process.argv[2]
const privateKey = process.argv[3]

if (!publicKey || !privateKey) {
  console.error('❌ Erro: Chaves não fornecidas')
  console.log('Uso: bun server/scripts/verify-vapid-keypair.ts <PUBLIC_KEY> <PRIVATE_KEY>')
  process.exit(1)
}

verifyVapidKeyPair(publicKey, privateKey)
  .then((isValid) => {
    process.exit(isValid ? 0 : 1)
  })
  .catch((error) => {
    console.error('❌ Erro:', error)
    process.exit(1)
  })

