#!/usr/bin/env node

/**
 * Script para testar envio de notificações push
 * Uso: node test-push-notification.js [appId] [title] [body]
 */

const API_URL = process.env.API_URL || 'http://localhost:3002/api/graphql'
const API_KEY = process.env.API_KEY || ''

async function graphqlRequest(query, variables = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY && { 'Authorization': `Bearer ${API_KEY}` }),
      ...(API_KEY && { 'X-API-Key': API_KEY }),
    },
    body: JSON.stringify({ query, variables }),
  })

  const result = await response.json()

  if (result.errors) {
    throw new Error(JSON.stringify(result.errors, null, 2))
  }

  return result.data
}

async function listApps() {
  const query = `
    query {
      apps {
        id
        name
        slug
        vapidPublicKey
        createdAt
      }
    }
  `

  const data = await graphqlRequest(query)
  return data.apps
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
        metadata
      }
    }
  `

  const data = await graphqlRequest(query, { appId })
  return data.devices
}

async function sendNotification(input) {
  const mutation = `
    mutation SendNotification($input: SendNotificationInput!) {
      sendNotification(input: $input) {
        id
        title
        body
        status
        totalTargets
        totalSent
        totalDelivered
        totalFailed
        createdAt
        sentAt
      }
    }
  `

  const data = await graphqlRequest(mutation, { input })
  return data.sendNotification
}

async function main() {
  const args = process.argv.slice(2)
  const appId = args[0]
  const title = args[1] || 'Teste de Notificação Push'
  const body = args[2] || 'Esta é uma notificação de teste do NitroPing!'

  try {
    console.log('🔍 Listando apps disponíveis...\n')
    const apps = await listApps()

    if (apps.length === 0) {
      console.error('❌ Nenhum app encontrado. Crie um app primeiro.')
      process.exit(1)
    }

    console.log('📱 Apps disponíveis:')
    apps.forEach(app => {
      console.log(`  - ${app.name} (${app.id})`)
      console.log(`    Slug: ${app.slug}`)
      console.log(`    VAPID Key: ${app.vapidPublicKey ? '✅ Configurado' : '❌ Não configurado'}`)
      console.log('')
    })

    const selectedAppId = appId || apps[0].id
    const selectedApp = apps.find(app => app.id === selectedAppId)

    if (!selectedApp) {
      console.error(`❌ App com ID ${selectedAppId} não encontrado.`)
      process.exit(1)
    }

    console.log(`\n📱 Usando app: ${selectedApp.name} (${selectedAppId})\n`)

    console.log('🔍 Listando dispositivos registrados...\n')
    const devices = await listDevices(selectedAppId)

    if (devices.length === 0) {
      console.error('❌ Nenhum dispositivo registrado encontrado para este app.')
      console.log('💡 Registre um dispositivo primeiro através do plugin WordPress ou SDK.')
      process.exit(1)
    }

    console.log(`📱 Dispositivos registrados (${devices.length}):`)
    const activeDevices = devices.filter(d => d.status === 'ACTIVE')
    const inactiveDevices = devices.filter(d => d.status === 'INACTIVE')
    const expiredDevices = devices.filter(d => d.status === 'EXPIRED')
    const pendingDevices = devices.filter(d => d.status === 'PENDING')

    console.log(`  ✅ Ativos (ACTIVE): ${activeDevices.length}`)
    console.log(`  ⚠️  Inativos (INACTIVE): ${inactiveDevices.length}`)
    console.log(`  ❌ Expirados (EXPIRED): ${expiredDevices.length}`)
    console.log(`  ⏳ Pendentes (PENDING): ${pendingDevices.length}\n`)

    if (activeDevices.length > 0) {
      console.log('📋 Dispositivos ATIVOS:')
      activeDevices.forEach(device => {
        const metadata = device.metadata ? JSON.parse(device.metadata) : {}
        console.log(`  - ${device.id}`)
        console.log(`    Plataforma: ${device.platform}`)
        console.log(`    User ID: ${device.userId || 'N/A'}`)
        if (metadata.userAgent) {
          console.log(`    User Agent: ${metadata.userAgent.substring(0, 50)}...`)
        }
        console.log('')
      })
    }

    console.log('\n🚀 Enviando notificação de teste...\n')
    console.log(`   Título: ${title}`)
    console.log(`   Corpo: ${body}`)
    console.log(`   App: ${selectedApp.name}`)
    console.log(`   Plataformas: WEB (todos os dispositivos ativos)\n`)

    const notification = await sendNotification({
      appId: selectedAppId,
      title,
      body,
      platforms: ['WEB'],
    })

    console.log('✅ Notificação enviada com sucesso!\n')
    console.log('📊 Estatísticas:')
    console.log(`   ID: ${notification.id}`)
    console.log(`   Status: ${notification.status}`)
    console.log(`   Total de alvos: ${notification.totalTargets}`)
    console.log(`   ✅ Enviadas: ${notification.totalSent}`)
    console.log(`   ❌ Falhadas: ${notification.totalFailed}`)
    console.log(`   📅 Criada em: ${notification.createdAt}`)
    if (notification.sentAt) {
      console.log(`   ⏰ Enviada em: ${notification.sentAt}`)
    }

    if (notification.totalTargets === 0) {
      console.log('\n⚠️  Nenhum dispositivo ativo encontrado para este app.')
      console.log('💡 Registre novos dispositivos ou reative os dispositivos expirados.')
    } else if (notification.totalFailed > 0) {
      console.log('\n⚠️  Algumas notificações falharam. Verifique os logs do servidor para mais detalhes.')
    } else if (notification.totalSent > 0) {
      console.log('\n🎉 Notificações enviadas com sucesso! Verifique os dispositivos para confirmar o recebimento.')
    } else {
      console.log('\n⚠️  Nenhuma notificação foi enviada. Verifique os logs do servidor para mais detalhes.')
    }

  } catch (error) {
    console.error('\n❌ Erro:', error.message)
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Certifique-se de que o servidor está rodando na porta 3002:')
      console.error('   bun run dev')
      console.error('\n   Ou configure a URL:')
      console.error('   API_URL=http://localhost:3002/api/graphql node test-push-notification.js')
    }
    process.exit(1)
  }
}

main()

