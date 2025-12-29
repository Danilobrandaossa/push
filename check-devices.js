#!/usr/bin/env node

/**
 * Script para verificar status dos dispositivos
 */

const API_URL = process.env.API_URL || 'http://localhost:3002/api/graphql'

async function graphqlRequest(query, variables = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  const result = await response.json()

  if (result.errors) {
    throw new Error(JSON.stringify(result.errors, null, 2))
  }

  return result.data
}

async function listDevices(appId) {
  const query = `
    query GetDevices($appId: ID) {
      devices(appId: $appId) {
        id
        appId
        token
        platform
        status
        userId
        createdAt
        updatedAt
        lastSeenAt
        metadata
      }
    }
  `

  const data = await graphqlRequest(query, { appId })
  return data.devices
}

async function main() {
  const appId = '019b31d9-9046-766d-8170-05a47332f4fe' // AMUCC

  try {
    console.log('🔍 Verificando dispositivos...\n')
    const devices = await listDevices(appId)

    if (devices.length === 0) {
      console.log('❌ Nenhum dispositivo encontrado.')
      return
    }

    console.log(`📱 Total de dispositivos: ${devices.length}\n`)

    const byStatus = {
      ACTIVE: devices.filter(d => d.status === 'ACTIVE'),
      INACTIVE: devices.filter(d => d.status === 'INACTIVE'),
      EXPIRED: devices.filter(d => d.status === 'EXPIRED'),
      PENDING: devices.filter(d => d.status === 'PENDING'),
    }

    console.log('📊 Status dos dispositivos:')
    console.log(`   ✅ ACTIVE: ${byStatus.ACTIVE.length}`)
    console.log(`   ⚠️  INACTIVE: ${byStatus.INACTIVE.length}`)
    console.log(`   ❌ EXPIRED: ${byStatus.EXPIRED.length}`)
    console.log(`   ⏳ PENDING: ${byStatus.PENDING.length}\n`)

    devices.forEach(device => {
      console.log(`\n📱 Dispositivo: ${device.id}`)
      console.log(`   Status: ${device.status}`)
      console.log(`   Plataforma: ${device.platform}`)
      console.log(`   User ID: ${device.userId || 'N/A'}`)
      console.log(`   Criado: ${device.createdAt}`)
      console.log(`   Atualizado: ${device.updatedAt}`)
      console.log(`   Último visto: ${device.lastSeenAt || 'Nunca'}`)
      console.log(`   Token: ${device.token.substring(0, 50)}...`)
    })

  } catch (error) {
    console.error('\n❌ Erro:', error.message)
    process.exit(1)
  }
}

main()

