<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle } from 'abckit/shadcn/alert'
import { Button } from 'abckit/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'abckit/shadcn/card'

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from 'abckit/shadcn/form'
import { Input } from 'abckit/shadcn/input'
import { Textarea } from 'abckit/shadcn/textarea'
import { useForm } from 'vee-validate'
import { z } from 'zod'

definePageMeta({
  layout: 'default',
})

const route = useRoute()
const router = useRouter()
const appId = computed(() => route.params.id as string)

// API queries
const { data: appData } = useApp(appId)
const app = computed(() => appData.value)

const { mutateAsync: configureWebPushMutation, isLoading: isConfiguring } = useConfigureWebPush()
const { refetch: generateVapidKeys, isLoading: isGenerating } = useGenerateVapidKeys()

// Form validation schema
const formSchema = z.object({
  subject: z.string().min(1, 'Subject is required').refine(
    val => val.startsWith('mailto:') || val.startsWith('https://'),
    'Subject must be a mailto: email or https: URL',
  ),
  publicKey: z.string().min(1, 'Public key is required'),
  privateKey: z.string().min(1, 'Private key is required'),
})

// Form setup
const { handleSubmit, isSubmitting, setValues, setFieldValue } = useForm({
  validationSchema: formSchema,
  initialValues: {
    subject: '',
    publicKey: '',
    privateKey: '',
  },
})

// Watch for app data and populate form
watch(app, (newApp) => {
  if (newApp && newApp.vapidPublicKey) {
    setValues({
      subject: newApp.vapidSubject || '',
      publicKey: newApp.vapidPublicKey || '',
      privateKey: newApp.vapidPrivateKey || '',
    })
  }
}, { immediate: true })

const { success: successToast, error: errorToast } = useToast()

// WordPress plugin download
const downloadWordPressPlugin = () => {
  if (!app.value?.vapidPublicKey || !app.value?.apiKey || !app.value?.id) {
    errorToast('Configuração incompleta', 'Configure as chaves VAPID, API Key e App ID primeiro')
    return
  }

  // Create a data URL with plugin configuration
  const pluginConfig = {
    apiUrl: window.location.origin,
    apiKey: app.value.apiKey,
    appId: app.value.id,
    vapidPublicKey: app.value.vapidPublicKey,
  }

  // Show instructions
  const instructions = `
# Configuração do Plugin WordPress NitroPing

## Passos para instalação:

1. Baixe o plugin da pasta \`wordpress-plugin\` do repositório
2. Faça upload da pasta para \`/wp-content/plugins/\` do seu WordPress
3. Renomeie a pasta para \`nitroping-push\`
4. Ative o plugin no painel do WordPress

## Configuração no WordPress:

1. Vá em **Configurações > NitroPing Push**
2. Preencha os seguintes campos:

**API URL:** ${pluginConfig.apiUrl}
**API Key:** ${pluginConfig.apiKey}
**App ID:** ${pluginConfig.appId}
**VAPID Public Key:** ${pluginConfig.vapidPublicKey}

3. Marque "Enable Push Notifications"
4. Salve as configurações

## Pronto!

O plugin irá automaticamente:
- Registrar o Service Worker
- Solicitar permissão de notificações aos visitantes
- Registrar dispositivos no NitroPing
- Permitir que você envie notificações push

Para mais informações, consulte o README.md na pasta do plugin.
  `.trim()

  // Copy instructions to clipboard
  navigator.clipboard.writeText(instructions).then(() => {
    successToast('Instruções copiadas!', 'As instruções de instalação foram copiadas para a área de transferência')
  }).catch(() => {
    // Fallback: show in alert
    alert(instructions)
  })
}

// WordPress script generation (legacy - mantido para compatibilidade)
const wordpressScript = computed(() => {
  if (!app.value?.vapidPublicKey || !app.value?.apiKey) {
    return ''
  }

  const apiUrl = window.location.origin
  const publicKey = app.value.vapidPublicKey
  const apiKey = app.value.apiKey

  return `<?php
/**
 * NitroPing Web Push Notifications para WordPress
 * 
 * Instruções:
 * 1. Adicione este código no functions.php do seu tema ou em um plugin personalizado
 * 2. Certifique-se de que o service worker (sw.js) está na raiz do seu site
 * 3. Ajuste a URL da API se necessário
 */

// Enfileirar scripts necessários
function nitroping_enqueue_scripts() {
    // Service Worker
    wp_enqueue_script('nitroping-sw', get_template_directory_uri() . '/sw.js', [], '1.0.0', false);
    
    // Script principal de push
    wp_enqueue_script('nitroping-push', get_template_directory_uri() . '/js/nitroping-push.js', [], '1.0.0', true);
    
    // Passar configurações para o JavaScript
    wp_localize_script('nitroping-push', 'nitropingConfig', [
        'apiUrl' => '${apiUrl}',
        'apiKey' => '${apiKey}',
        'vapidPublicKey' => '${publicKey}',
        'appId' => '${app.value?.id}',
    ]);
}
add_action('wp_enqueue_scripts', 'nitroping_enqueue_scripts');

// Criar arquivo JavaScript (salve como /js/nitroping-push.js no tema)
/*
// nitroping-push.js
(function() {
    'use strict';
    
    const config = window.nitropingConfig;
    
    // Verificar suporte do navegador
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Push notifications não são suportados neste navegador');
        return;
    }
    
    // Converter VAPID public key para Uint8Array
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\\-/g, '+')
            .replace(/_/g, '/');
        
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
    
    // Registrar Service Worker e solicitar permissão
    async function registerPushNotifications() {
        try {
            // Registrar Service Worker
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registrado:', registration);
            
            // Solicitar permissão
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.log('Permissão de notificação negada');
                return;
            }
            
            // Converter chave pública
            const applicationServerKey = urlBase64ToUint8Array(config.vapidPublicKey);
            
            // Inscrever para push
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: applicationServerKey
            });
            
            // Converter subscription para formato base64
            const key = subscription.getKey('p256dh');
            const auth = subscription.getKey('auth');
            
            const subscriptionData = {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
                    auth: btoa(String.fromCharCode(...new Uint8Array(auth)))
                }
            };
            
            // Enviar subscription para o servidor
            const response = await fetch(config.apiUrl + '/api/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + config.apiKey
                },
                body: JSON.stringify({
                    query: \`
                        mutation RegisterDevice($input: RegisterDeviceInput!) {
                            registerDevice(input: $input) {
                                id
                                platform
                                createdAt
                            }
                        }
                    \`,
                    variables: {
                        input: {
                            appId: config.appId,
                            platform: 'WEB',
                            token: subscription.endpoint,
                            webPushP256dh: subscriptionData.keys.p256dh,
                            webPushAuth: subscriptionData.keys.auth
                        }
                    }
                })
            });
            
            const result = await response.json();
            
            if (result.errors) {
                console.error('Erro ao registrar dispositivo:', result.errors);
            } else {
                console.log('Dispositivo registrado com sucesso:', result.data);
            }
        } catch (error) {
            console.error('Erro ao registrar push notifications:', error);
        }
    }
    
    // Inicializar quando a página carregar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registerPushNotifications);
    } else {
        registerPushNotifications();
    }
})();
*/

// Service Worker (salve como /sw.js na raiz do WordPress)
/*
// sw.js
self.addEventListener('push', function(event) {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Nova notificação';
    const options = {
        body: data.body || '',
        icon: data.icon || '/wp-content/themes/seu-tema/images/icon.png',
        badge: data.badge || '/wp-content/themes/seu-tema/images/badge.png',
        image: data.image || null,
        data: data.data || {},
        requireInteraction: data.requireInteraction || false,
        actions: data.actions || []
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    if (event.notification.data && event.notification.data.url) {
        event.waitUntil(
            clients.openWindow(event.notification.data.url)
        );
    }
});
*/
`
})

async function copyWordPressScript() {
  if (!wordpressScript.value) {
    errorToast('Configuração incompleta', 'Configure as chaves VAPID e API Key primeiro')
    return
  }

  try {
    await navigator.clipboard.writeText(wordpressScript.value)
    successToast('Script copiado!', 'O script WordPress foi copiado para a área de transferência')
  }
  catch (error) {
    console.error('Erro ao copiar script:', error)
    errorToast('Erro ao copiar', 'Não foi possível copiar o script. Tente selecionar e copiar manualmente.')
  }
}

// Generate new VAPID keys
async function generateKeys() {
  try {
    const result = await generateVapidKeys()
    const keys = result.data

    if (keys) {
      setFieldValue('publicKey', keys.publicKey)
      setFieldValue('privateKey', keys.privateKey)

      // Set default subject if empty
      const currentSubject = (document.querySelector('[name="subject"]') as HTMLInputElement)?.value
      if (!currentSubject) {
        setFieldValue('subject', 'mailto:admin@example.com')
      }

      successToast('VAPID keys generated successfully', 'New keys have been generated and populated in the form.')
    }
  }
  catch (error) {
    console.error('Error generating VAPID keys:', error)
    errorToast('Failed to generate VAPID keys', 'Please try again or check your configuration.')
  }
}

// Form submission
const onSubmit = handleSubmit(async (values) => {
  try {
    const result = await configureWebPushMutation({
      id: appId.value,
      input: {
        subject: values.subject.trim(),
        publicKey: values.publicKey.trim(),
        privateKey: values.privateKey.trim(),
      },
    })

    if (result) {
      // Update form with saved values (including decrypted private key)
      setValues({
        subject: result.vapidSubject || values.subject,
        publicKey: result.vapidPublicKey || values.publicKey,
        privateKey: result.vapidPrivateKey || values.privateKey,
      })

      successToast('Web Push configured successfully', 'Your VAPID configuration has been saved.')

      // Wait a bit for cache to update, then navigate back
      setTimeout(() => {
        router.push(`/apps/${appId.value}/providers`)
      }, 500)
    }
  }
  catch (error) {
    console.error('Error configuring Web Push:', error)
    const errorMessage = error instanceof Error ? error.message : 'Please check your settings and try again.'
    errorToast('Failed to configure Web Push', errorMessage)
  }
})

function goBack() {
  router.push(`/apps/${appId.value}/providers`)
}

// Check if app has existing Web Push configuration
const hasExistingConfig = computed(() => {
  return app.value?.vapidPublicKey && app.value?.vapidSubject
})
</script>

<template>
  <div v-if="app">
    <!-- App Header -->
    <AppDetailHeader :app="app" />

    <!-- Page Header -->
    <div class="flex items-center space-x-4 mb-8">
      <Button variant="ghost" size="icon" @click="goBack">
        <Icon name="lucide:arrow-left" class="size-4" />
      </Button>
      <div>
        <h1 class="text-3xl font-bold mb-1">Configure Web Push</h1>
        <p class="text-muted-foreground">Set up push notifications for web browsers</p>
      </div>
    </div>

    <!-- Configuration Form -->
    <div class="max-w-2xl space-y-6">
      <!-- Current Status -->
      <Card v-if="hasExistingConfig">
        <CardHeader>
          <CardTitle class="flex items-center space-x-2">
            <Icon name="lucide:check" class="h-5 w-5 text-green-600" />
            <span>Web Push Currently Configured</span>
          </CardTitle>
          <CardDescription>Your app is currently set up to send push notifications to web browsers</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-2">
            <p class="text-sm"><strong>Subject:</strong> {{ app.vapidSubject }}</p>
            <p class="text-sm"><strong>Public Key:</strong> {{ app.vapidPublicKey?.substring(0, 32) }}...</p>
            <p class="text-sm text-muted-foreground">Private key is securely stored and encrypted.</p>
          </div>
        </CardContent>
      </Card>

      <!-- Configuration Guide -->
      <Card>
        <CardHeader>
          <CardTitle>Setup Guide</CardTitle>
          <CardDescription>Web Push uses VAPID (Voluntary Application Server Identification) for authentication</CardDescription>
        </CardHeader>
        <CardContent>
          <ol class="space-y-3 text-sm">
            <li class="flex items-start space-x-3">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</span>
              <div>
                <p class="font-medium">Generate VAPID Keys</p>
                <p class="text-muted-foreground">Click "Generate New Keys" below to create a public/private key pair</p>
              </div>
            </li>
            <li class="flex items-start space-x-3">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</span>
              <div>
                <p class="font-medium">Set Subject</p>
                <p class="text-muted-foreground">Provide a contact email or website URL for identification</p>
              </div>
            </li>
            <li class="flex items-start space-x-3">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">3</span>
              <div>
                <p class="font-medium">Use Public Key in Client</p>
                <p class="text-muted-foreground">Use the public key in your web app's service worker for subscriptions</p>
              </div>
            </li>
            <li class="flex items-start space-x-3">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">4</span>
              <div>
                <p class="font-medium">Test Notifications</p>
                <p class="text-muted-foreground">Register devices and test push notifications from your dashboard</p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>

      <!-- Configuration Form -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <div>
              <CardTitle>Web Push Configuration</CardTitle>
              <CardDescription>Enter your VAPID credentials for web push notifications</CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              :disabled="isGenerating || isSubmitting || isConfiguring"
              @click="generateKeys"
            >
              <Icon v-if="isGenerating" name="lucide:loader-2" class="mr-2 size-4 animate-spin" />
              <Icon v-else name="lucide:key" class="mr-2 size-4" />
              Generate New Keys
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form class="space-y-6" @submit="onSubmit">
            <!-- Subject -->
            <FormField v-slot="{ componentField }" name="subject">
              <FormItem>
                <FormLabel class="required">Subject</FormLabel>
                <FormControl>
                  <Input
                    v-bind="componentField"
                    placeholder="mailto:admin@yourapp.com or https://yourapp.com"
                    :disabled="isSubmitting || isConfiguring"
                  />
                </FormControl>
                <FormDescription>
                  Your contact email (mailto:) or website URL (https://) for VAPID identification
                </FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>

            <!-- Public Key -->
            <FormField v-slot="{ componentField }" name="publicKey">
              <FormItem>
                <FormLabel class="required">VAPID Public Key</FormLabel>
                <FormControl>
                  <Textarea
                    v-bind="componentField"
                    placeholder="BNcRdreALRFXTkOOUHK5EgmsrXwgUGHoebDFOKCNXGY..."
                    rows="3"
                    class="font-mono text-xs"
                    :disabled="isSubmitting || isConfiguring"
                  />
                </FormControl>
                <FormDescription>
                  Your VAPID public key (will be used in your web app's client code)
                </FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>

            <!-- Private Key -->
            <FormField v-slot="{ componentField }" name="privateKey">
              <FormItem>
                <FormLabel class="required">VAPID Private Key</FormLabel>
                <FormControl>
                  <Textarea
                    v-bind="componentField"
                    placeholder="3kLs9XJ5wgLKJ5hXOp6B7c_jP2b4NaTgP2k..."
                    rows="3"
                    class="font-mono text-xs"
                    :disabled="isSubmitting || isConfiguring"
                  />
                </FormControl>
                <FormDescription>
                  Your VAPID private key (keep this secret and secure)
                </FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>

            <!-- Key Generation Help -->
            <Alert>
              <Icon name="lucide:refresh-cw" class="size-4" />
              <AlertTitle>Need VAPID Keys?</AlertTitle>
              <AlertDescription>
                If you don't have VAPID keys yet, click "Generate New Keys" above to create a new key pair automatically.
              </AlertDescription>
            </Alert>

            <!-- Security Warning -->
            <Alert>
              <Icon name="lucide:alert-triangle" class="size-4" />
              <AlertTitle>Security Notice</AlertTitle>
              <AlertDescription>
                Your private key will be encrypted and securely stored. The public key will be used in your web app's client code to subscribe users to push notifications.
              </AlertDescription>
            </Alert>

            <!-- Submit Buttons -->
            <div class="flex space-x-3 pt-4">
              <Button
                type="submit"
                :disabled="isSubmitting || isConfiguring"
                class="flex-1"
              >
                <Icon v-if="isSubmitting || isConfiguring" name="lucide:loader-2" class="size-4 mr-2 animate-spin" />
                <Icon v-else name="lucide:save" class="size-4 mr-2" />
                {{ hasExistingConfig ? 'Update Configuration' : 'Save Configuration' }}
              </Button>
              <Button type="button" variant="outline" @click="goBack">
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <!-- WordPress Plugin -->
      <Card v-if="hasExistingConfig">
        <CardHeader>
          <div class="flex items-center justify-between">
            <div>
              <CardTitle>Plugin WordPress</CardTitle>
              <CardDescription>Plugin completo para integrar push notifications no seu site WordPress</CardDescription>
            </div>
            <Button
              type="button"
              variant="default"
              :disabled="!app?.vapidPublicKey || !app?.apiKey || !app?.id"
              @click="downloadWordPressPlugin"
            >
              <Icon name="lucide:download" class="mr-2 size-4" />
              Copiar Instruções
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <Alert>
              <Icon name="lucide:info" class="size-4" />
              <AlertTitle>Plugin WordPress Completo</AlertTitle>
              <AlertDescription>
                Um plugin WordPress completo está disponível na pasta <code class="bg-muted px-1 py-0.5 rounded text-xs">wordpress-plugin</code> do repositório.
                O plugin inclui:
                <ul class="list-disc list-inside mt-2 space-y-1">
                  <li>Interface administrativa para configuração</li>
                  <li>Registro automático de dispositivos</li>
                  <li>Service Worker para notificações em background</li>
                  <li>Suporte a ações e imagens em notificações</li>
                  <li>Instalação e desinstalação limpa</li>
                </ul>
              </AlertDescription>
            </Alert>
            
            <div class="space-y-2">
              <h4 class="font-medium">Localização do Plugin:</h4>
              <code class="block bg-muted p-2 rounded text-xs">wordpress-plugin/</code>
            </div>

            <div class="space-y-2">
              <h4 class="font-medium">Instalação Rápida:</h4>
              <ol class="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Copie a pasta <code class="bg-muted px-1 py-0.5 rounded">wordpress-plugin</code> para <code class="bg-muted px-1 py-0.5 rounded">/wp-content/plugins/</code></li>
                <li>Renomeie para <code class="bg-muted px-1 py-0.5 rounded">nitroping-push</code></li>
                <li>Ative o plugin no WordPress</li>
                <li>Configure em <strong>Configurações > NitroPing Push</strong></li>
              </ol>
            </div>

            <Alert>
              <Icon name="lucide:file-text" class="size-4" />
              <AlertTitle>Documentação Completa</AlertTitle>
              <AlertDescription>
                Consulte o arquivo <code class="bg-muted px-1 py-0.5 rounded">README.md</code> na pasta do plugin para instruções detalhadas, solução de problemas e personalização.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>

      <!-- Implementation Example -->
      <Card>
        <CardHeader>
          <CardTitle>Client Implementation</CardTitle>
          <CardDescription>Example code for your web application</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <div>
              <h4 class="font-medium mb-2">Service Worker Registration</h4>
              <pre class="bg-muted p-3 rounded text-xs overflow-x-auto"><code>// Register service worker and subscribe to push
const registration = await navigator.serviceWorker.register('/sw.js');
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: '{{ app.vapidPublicKey || "YOUR_PUBLIC_KEY" }}'
});

// Send subscription to your server
await fetch('/api/v1/devices/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    endpoint: subscription.endpoint,
    keys: {
      p256dh: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')))),
      auth: btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth'))))
    }
  })
});</code></pre>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Additional Resources -->
      <Card>
        <CardHeader>
          <CardTitle>Additional Resources</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <a
              href="https://developer.mozilla.org/en-US/docs/Web/API/Push_API"
              target="_blank"
              class="flex items-center space-x-2 text-sm text-primary hover:underline"
            >
              <Icon name="lucide:file-text" class="size-4" />
              <span>MDN Push API Documentation</span>
            </a>
            <a
              href="https://web.dev/push-notifications/"
              target="_blank"
              class="flex items-center space-x-2 text-sm text-primary hover:underline"
            >
              <Icon name="lucide:file-text" class="size-4" />
              <span>Web Push Notifications Guide</span>
            </a>
            <a
              href="https://tools.ietf.org/html/rfc8292"
              target="_blank"
              class="flex items-center space-x-2 text-sm text-primary hover:underline"
            >
              <Icon name="lucide:file-text" class="size-4" />
              <span>VAPID Specification (RFC 8292)</span>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>

  <!-- Loading State -->
  <div v-else class="flex items-center justify-center h-64">
    <Icon name="lucide:loader-2" class="h-8 w-8 animate-spin" />
  </div>
</template>

<style scoped>
.required::after {
  content: "*";
  color: rgb(239 68 68);
  margin-left: 0.25rem;
}
</style>
