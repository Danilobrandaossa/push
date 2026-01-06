<script setup lang="ts">
import { Badge } from 'abckit/shadcn/badge'
import { Button } from 'abckit/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'abckit/shadcn/card'

definePageMeta({
  layout: 'default',
})

const route = useRoute()
const appId = computed(() => route.params.id as string)

// API queries
const { data: appData } = useApp(appId)
const app = computed(() => appData.value)

// Methods
function configureFCM() {
  navigateTo(`/apps/${appId.value}/providers/fcm`)
}

function configureAPNs() {
  navigateTo(`/apps/${appId.value}/providers/apns`)
}

function configureWebPush() {
  navigateTo(`/apps/${appId.value}/providers/webpush`)
}
</script>

<template>
  <div v-if="app">
    <!-- App Header -->
    <AppDetailHeader :app="app" />

    <!-- Navigation -->
    <AppNavigation :app-id="appId" />

    <!-- Providers Content -->
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-bold mb-2">Provedores de Push</h2>
        <p class="text-muted-foreground">Configure seus provedores de notificação push para começar a enviar notificações.</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- FCM -->
        <Card>
          <CardHeader>
            <div class="flex items-center space-x-3">
              <div class="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900 flex items-center justify-center">
                <Icon name="lucide:smartphone" class="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <CardTitle>Firebase FCM</CardTitle>
                <CardDescription>Notificações Android</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent class="space-y-4">
            <Badge :variant="app.fcmProjectId ? 'default' : 'secondary'">
              {{ app.fcmProjectId ? 'Configurado' : 'Não Configurado' }}
            </Badge>

            <div v-if="app.fcmProjectId" class="space-y-2">
              <p class="text-sm"><strong>Project ID:</strong> {{ app.fcmProjectId }}</p>
              <p class="text-sm text-muted-foreground">Conta de serviço configurada</p>
            </div>

            <div v-else class="space-y-2">
              <p class="text-sm text-muted-foreground">Configure o Firebase Cloud Messaging para enviar notificações para dispositivos Android.</p>
            </div>

            <Button variant="outline" size="sm" class="w-full" @click="configureFCM">
              {{ app.fcmProjectId ? 'Atualizar' : 'Configurar' }} FCM
            </Button>
          </CardContent>
        </Card>

        <!-- APNs -->
        <Card>
          <CardHeader>
            <div class="flex items-center space-x-3">
              <div class="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                <Icon name="lucide:smartphone" class="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle>Apple APNs</CardTitle>
                <CardDescription>Notificações iOS</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent class="space-y-4">
            <Badge :variant="app.apnsKeyId ? 'default' : 'secondary'">
              {{ app.apnsKeyId ? 'Configurado' : 'Não Configurado' }}
            </Badge>

            <div v-if="app.apnsKeyId" class="space-y-2">
              <p class="text-sm"><strong>Key ID:</strong> {{ app.apnsKeyId }}</p>
              <p class="text-sm"><strong>Team ID:</strong> {{ app.apnsTeamId }}</p>
              <p class="text-sm text-muted-foreground">Chave privada configurada</p>
            </div>

            <div v-else class="space-y-2">
              <p class="text-sm text-muted-foreground">Configure o Apple Push Notification service para enviar notificações para dispositivos iOS.</p>
            </div>

            <Button variant="outline" size="sm" class="w-full" @click="configureAPNs">
              {{ app.apnsKeyId ? 'Atualizar' : 'Configurar' }} APNs
            </Button>
          </CardContent>
        </Card>

        <!-- Web Push -->
        <Card>
          <CardHeader>
            <div class="flex items-center space-x-3">
              <div class="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <Icon name="lucide:globe" class="h-5 w-5 text-green-600" />
              </div>
              <div>
                <CardTitle>Web Push</CardTitle>
                <CardDescription>Notificações de Navegador</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent class="space-y-4">
            <Badge :variant="app.vapidPublicKey ? 'default' : 'secondary'">
              {{ app.vapidPublicKey ? 'Configurado' : 'Não Configurado' }}
            </Badge>

            <div v-if="app.vapidPublicKey" class="space-y-2">
              <p class="text-sm"><strong>Assunto:</strong> {{ app.vapidSubject }}</p>
              <p class="text-sm text-muted-foreground">Chaves VAPID configuradas</p>
            </div>

            <div v-else class="space-y-2">
              <p class="text-sm text-muted-foreground">Configure Web Push para enviar notificações para navegadores web.</p>
            </div>

            <Button variant="outline" size="sm" class="w-full" @click="configureWebPush">
              {{ app.vapidPublicKey ? 'Atualizar' : 'Configurar' }} Web Push
            </Button>
          </CardContent>
        </Card>
      </div>

      <!-- Configuration Guide -->
      <Card>
        <CardHeader>
          <CardTitle>Guia de Configuração</CardTitle>
          <CardDescription>Siga estes passos para configurar seus provedores de push</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="space-y-2">
              <h4 class="font-medium text-orange-600">Firebase FCM</h4>
              <ol class="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Crie um projeto Firebase</li>
                <li>Gere uma chave de conta de serviço</li>
                <li>Faça upload do arquivo JSON</li>
                <li>Teste com dispositivos Android</li>
              </ol>
            </div>
            <div class="space-y-2">
              <h4 class="font-medium text-blue-600">Apple APNs</h4>
              <ol class="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Crie uma conta Apple Developer</li>
                <li>Gere uma chave de autenticação APNs</li>
                <li>Obtenha seu Team ID e Key ID</li>
                <li>Teste com dispositivos iOS</li>
              </ol>
            </div>
            <div class="space-y-2">
              <h4 class="font-medium text-green-600">Web Push</h4>
              <ol class="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Gere chaves VAPID</li>
                <li>Defina o assunto (email ou URL)</li>
                <li>Configure o service worker</li>
                <li>Teste com navegadores</li>
              </ol>
            </div>
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
