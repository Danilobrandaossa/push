# Gteck Push - Plugin WordPress

Plugin WordPress para integrar notificações push do Gteck Push no seu site WordPress.

## 📋 Requisitos

- WordPress 5.0 ou superior
- PHP 7.4 ou superior
- Site com HTTPS (obrigatório para push notifications)
- Conta no Gteck Push com App configurado

## 🚀 Instalação

### Método 1: Upload Manual

1. Baixe ou clone este repositório
2. Faça upload da pasta `wordpress-plugin` para `/wp-content/plugins/` do seu WordPress
3. Renomeie a pasta para `nitroping-push`
4. Ative o plugin no painel administrativo do WordPress em **Plugins**

### Método 2: Via ZIP

1. Compacte a pasta `wordpress-plugin` em um arquivo ZIP
2. No WordPress, vá em **Plugins > Adicionar Novo > Enviar Plugin**
3. Selecione o arquivo ZIP e clique em **Instalar Agora**
4. Ative o plugin após a instalação

## ⚙️ Configuração

1. Após ativar o plugin, vá em **Configurações > Gteck Push**
2. Preencha os seguintes campos:
   - **URL da API**: URL da sua instalação do Gteck Push (ex: `https://gteck.up.railway.app`)
   - **Chave de API (API Key)**: Chave de API do seu App no Gteck Push
   - **ID do App**: ID do seu App no Gteck Push
   - **Chave Pública VAPID**: Chave pública VAPID configurada no Gteck Push
3. Marque a opção **Ativar Notificações Push**
4. Clique em **Salvar Configurações**

### Onde encontrar essas informações?

- **URL da API**: URL onde seu Gteck Push está hospedado
- **Chave de API**: Disponível na página de configurações do seu App no dashboard do Gteck Push
- **ID do App**: ID único do seu App (disponível na URL ou na página do App)
- **Chave Pública VAPID**: Disponível na página de configuração Web Push do seu App no Gteck Push

## 📱 Como Funciona

1. O plugin registra automaticamente um Service Worker no navegador dos visitantes
2. Quando um visitante acessa seu site, o plugin solicita permissão para enviar notificações
3. Se o visitante aceitar, o dispositivo é registrado no NitroPing
4. Você pode enviar notificações push através do dashboard do Gteck Push
5. Os visitantes receberão as notificações mesmo quando não estiverem no site

## 🎯 Funcionalidades

- ✅ Registro automático de dispositivos
- ✅ Service Worker para receber notificações em background
- ✅ Suporte a ações em notificações
- ✅ Suporte a imagens em notificações
- ✅ Redirecionamento ao clicar na notificação
- ✅ Interface administrativa simples
- ✅ Compatível com todos os navegadores modernos

## 🔧 Personalização

### Modificar comportamento de auto-subscribe

Por padrão, o plugin tenta se inscrever automaticamente quando a página carrega. Para modificar isso e mostrar um botão personalizado, você pode:

1. Edite o arquivo `assets/js/nitroping-push.js`
2. Comente ou remova a chamada automática de `subscribeToPush()` na função `handlePushSetup()`
3. Adicione um botão no seu tema que chame `window.nitropingSubscribe()` quando clicado

Exemplo de botão:

```html
<button onclick="window.nitropingSubscribe()">Ativar Notificações</button>
```

### Personalizar ícones de notificação

1. Adicione seus próprios ícones na pasta `assets/images/`:
   - `icon-192x192.png` (192x192 pixels)
   - `badge-72x72.png` (72x72 pixels)
2. Atualize os caminhos no arquivo `sw.js` se necessário

## 🐛 Solução de Problemas

### Notificações não aparecem

1. Verifique se o site está usando HTTPS (obrigatório)
2. Verifique se todas as configurações estão preenchidas corretamente
3. Verifique o console do navegador para erros
4. Verifique se o Service Worker está registrado (DevTools > Application > Service Workers)

### Erro ao registrar dispositivo

1. Verifique se a API Key e App ID estão corretos
2. Verifique se a API URL está acessível
3. Verifique os logs do servidor para erros de API

### Service Worker não registra

1. Verifique se o arquivo `sw.js` está acessível
2. Verifique se há erros no console do navegador
3. Limpe o cache do navegador e tente novamente

## 📝 Changelog

### 1.0.0
- Versão inicial
- Registro automático de dispositivos
- Service Worker para notificações
- Interface administrativa

## 📄 Licença

MIT License - veja o arquivo LICENSE para detalhes

## 🤝 Suporte

Para suporte, consulte a documentação do Gteck Push ou entre em contato com a equipe de suporte.

## 🔗 Links Úteis

- [Documentação do Gteck Push](https://gteck.up.railway.app)
- [Dashboard do Gteck Push](https://gteck.up.railway.app)

