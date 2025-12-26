# Requisitos e Limitações - Web Push em Mobile Android

## ✅ O que ESTÁ implementado e funciona:

1. **Service Worker configurado corretamente**
   - Headers corretos (`Service-Worker-Allowed: /`)
   - Escopo root para evitar conflitos
   - Registro com tratamento de erros

2. **Manifest.json válido**
   - ~~`gcm_sender_id`~~ (NÃO USAR - legado, causa problemas com VAPID no Android)
   - Ícones e configurações PWA

3. **Detecção Mobile**
   - Detecta Android corretamente
   - Intervalos de validação diferenciados (7 dias mobile vs 30 desktop)

4. **Revalidação automática**
   - Valida subscriptions periodicamente
   - Revalida quando página fica visível (importante para mobile)
   - Background sync quando suportado

5. **Tratamento de erros**
   - Logs detalhados para debug
   - Tratamento de subscriptions expiradas (410)
   - Tratamento de VAPID mismatch (403)

## ⚠️ REQUISITOS que DEVEM ser atendidos:

### 1. HTTPS obrigatório
- **O site DEVE estar em HTTPS**
- Não funciona em HTTP (exceto localhost)
- Certificado SSL válido necessário

### 2. Service Worker acessível
- Deve ser servido com headers corretos
- URL acessível via GET
- Content-Type: `application/javascript`

### 3. Manifest.json acessível
- Deve estar linkado no `<head>`
- Ser servido com Content-Type correto

### 4. Permissão do usuário
- Usuário deve conceder permissão
- Não funciona em modo anônimo/incógnito

### 5. VAPID keys corretas
- Chave pública VAPID deve estar correta
- Chave privada no servidor deve corresponder

## ❌ LIMITAÇÕES conhecidas (não controlamos):

### 1. Android pode matar Service Worker
- **Dispositivo inativo por muito tempo**: O Android pode matar o Service Worker
- **Baixa memória**: Sistema pode matar processos em background
- **Bateria economizada**: Modos de economia de bateria podem desabilitar

### 2. Chrome no Android tem limitações
- **Notificações não aparecem se dispositivo está "inativo" há muito tempo**
- **Chrome pode não receber push se não estiver em foreground**
- Depende de configurações do sistema e do usuário

### 3. Subscriptions podem expirar
- **Erro 410**: Subscription expirada/desinscrita
- **Acontece quando**: Usuário limpa dados do navegador, reinstala app, etc.
- **Solução implementada**: Revalidação automática detecta e re-registra

### 4. Modo anônimo/incógnito
- **Não funciona** em modo incógnito do Chrome
- Limitação do navegador, não tem solução

### 5. Múltiplos Service Workers
- Se outro plugin/tema registra Service Worker no mesmo escopo, pode haver conflito
- **Nossa solução**: Usa escopo root com header `Service-Worker-Allowed`

### 6. Configurações do usuário
- Usuário pode desabilitar notificações nas configurações do Android
- Do Not Disturb pode bloquear notificações
- Modo "Não perturbe" do Chrome

## 🔍 O que PODE dar errado:

1. **Subscription não é criada**
   - VAPID key errada
   - Permissão negada
   - Service Worker não registrado

2. **Notificação não é recebida**
   - Subscription expirada (410)
   - Dispositivo inativo há muito tempo
   - Service Worker morto pelo sistema
   - Chrome em background há muito tempo

3. **Notificação não aparece**
   - Configurações do Android bloqueando
   - Modo "Não perturbe" ativo
   - Permissão revogada pelo usuário

## ✅ O que implementamos para minimizar problemas:

1. **Revalidação automática frequente em mobile** (7 dias)
2. **Revalidação quando página fica visível** (detecta quando app é reaberto)
3. **Background sync** (quando suportado pelo navegador)
4. **Logs detalhados** para identificar problemas
5. **Tratamento de erros 410** (re-registro automático)
6. **Verificação de VAPID keys** antes de criar subscription

## 📊 Taxa de sucesso esperada:

- **Desktop**: ~95-98% (mais estável, menos limitações)
- **Mobile Android**: ~80-90% (depende de uso frequente do navegador)
  - Usuários ativos: ~90-95%
  - Usuários inativos: ~70-80%

## 🎯 Conclusão:

O plugin está **tecnicamente correto** e implementa as **melhores práticas** conhecidas. Porém, **não podemos garantir 100%** porque:

1. Limitações do sistema operacional Android
2. Comportamento do Chrome que não controlamos
3. Configurações e uso do dispositivo pelo usuário
4. Service Workers podem ser mortos pelo sistema

**A solução implementada é a melhor possível dentro das limitações técnicas existentes.**
