#!/usr/bin/env bun
/**
 * Script para verificar se a chave VAPID no WordPress corresponde à chave no banco
 */

const WORDPRESS_VAPID_KEY = 'BBseA5iUkM9CR6D--p_fpploFEtGqlib4MGgHiRCmFEeVKj9QDtSbZB2LMhDeylbS7YdrOcJCQ1PQcIbg8HF3Os'

async function checkKeysMatch() {
  try {
    const { getDatabase } = await import('./server/database/connection')
    const { app } = await import('./server/database/schema')
    const { eq } = await import('drizzle-orm')
    
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
    const dbVapidKey = (appData.vapidPublicKey || '').replace(/\s+/g, '')
    const wpVapidKey = WORDPRESS_VAPID_KEY.replace(/\s+/g, '')
    
    console.log('🔍 Comparando chaves VAPID:\n')
    console.log('WordPress (Frontend):', wpVapidKey)
    console.log('Banco de Dados:      ', dbVapidKey)
    console.log('')
    
    if (wpVapidKey === dbVapidKey) {
      console.log('✅✅✅ AS CHAVES CORRESPONDEM!\n')
      console.log('Isso significa que o frontend está usando a chave correta.')
      return true
    } else {
      console.log('❌❌❌ AS CHAVES NÃO CORRESPONDEM!\n')
      console.log('PROBLEMA ENCONTRADO:')
      console.log('  - O WordPress está usando uma chave diferente')
      console.log('  - O banco de dados tem outra chave')
      console.log('  - Isso causa erro 403 quando tenta enviar push\n')
      console.log('SOLUÇÃO:')
      console.log('  - Atualize a chave VAPID pública no WordPress para corresponder ao banco')
      console.log('  - Ou atualize as chaves no banco para corresponder ao WordPress')
      return false
    }
  } catch (error) {
    console.error('❌ Erro:', error)
    if (error instanceof Error) {
      console.error('Mensagem:', error.message)
    }
    return false
  }
}

checkKeysMatch().then((matches) => {
  process.exit(matches ? 0 : 1)
})

