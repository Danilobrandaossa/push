#!/usr/bin/env node

/**
 * Script para testar envio de notificações push com ícone
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

async function sendNotificationWithIcon(appId, title, body, iconUrl) {
  const mutation = `
    mutation SendNotification($input: SendNotificationInput!) {
      sendNotification(input: $input) {
        id
        title
        body
        icon
        imageUrl
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

  const input = {
    appId,
    title,
    body,
    icon: iconUrl,
    platforms: ['WEB'],
  }

  const data = await graphqlRequest(mutation, { input })
  return data.sendNotification
}

async function main() {
  const appId = '019b31d9-9046-766d-8170-05a47332f4fe' // AMUCC
  const title = 'Notificação com Ícone PNG'
  const body = 'Esta notificação foi enviada com o novo ícone PNG para teste!'
  const iconUrl = 'https://amucc.com.br/wp-content/uploads/2025/12/Design_sem_nome__1_-removebg-preview.png'

  try {
    console.log('🚀 Enviando notificação push com ícone...\n')
    console.log(`   App ID: ${appId}`)
    console.log(`   Título: ${title}`)
    console.log(`   Corpo: ${body}`)
    console.log(`   Ícone: ${iconUrl}\n`)

    const notification = await sendNotificationWithIcon(appId, title, body, iconUrl)

    console.log('✅ Notificação enviada com sucesso!\n')
    console.log('📊 Estatísticas:')
    console.log(`   ID: ${notification.id}`)
    console.log(`   Status: ${notification.status}`)
    console.log(`   Ícone: ${notification.icon}`)
    console.log(`   Total de alvos: ${notification.totalTargets}`)
    console.log(`   ✅ Enviadas: ${notification.totalSent}`)
    console.log(`   ❌ Falhadas: ${notification.totalFailed}`)
    console.log(`   📅 Criada em: ${notification.createdAt}`)
    if (notification.sentAt) {
      console.log(`   ⏰ Enviada em: ${notification.sentAt}`)
    }

    if (notification.totalFailed > 0) {
      console.log('\n⚠️  Algumas notificações falharam. Verifique os logs do servidor.')
    } else if (notification.totalSent > 0) {
      console.log('\n🎉 Notificação enviada com sucesso! Verifique o dispositivo para confirmar o recebimento do ícone.')
    } else {
      console.log('\n⚠️  Nenhuma notificação foi enviada. Verifique se há dispositivos ativos.')
    }
  } catch (error) {
    console.error('\n❌ Erro:', error.message)
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\n💡 Certifique-se de que o servidor está rodando na porta 3002:')
      console.error('   bun run dev')
    }
    process.exit(1)
  }
}

main()

