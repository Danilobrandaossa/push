<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle } from 'abckit/shadcn/alert'
import { Button } from 'abckit/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'abckit/shadcn/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from 'abckit/shadcn/dialog'
import { Input } from 'abckit/shadcn/input'
import { Label } from 'abckit/shadcn/label'
import { Switch } from 'abckit/shadcn/switch'
import { Textarea } from 'abckit/shadcn/textarea'

definePageMeta({
  layout: 'default',
})

const route = useRoute()
const appId = computed(() => route.params.id as string)

// API queries
const { data: appData } = useApp(appId)
const app = computed(() => appData.value)

const { mutateAsync: updateAppMutation, isLoading: isUpdatingApp } = useUpdateApp()
const { mutateAsync: regenerateApiKeyMutation, isLoading: isRegeneratingKey } = useRegenerateApiKey()
const { mutateAsync: deleteAppMutation, isLoading: isDeletingApp } = useDeleteApp()

// Reactive data
const appForm = ref({
  name: '',
  description: '',
  isActive: true,
})

const showDeleteDialog = ref(false)
const showRegenerateDialog = ref(false)
const deleteConfirmText = ref('')
const isAppIdCopied = ref(false)

// Watch for app data changes
watch(app, (newApp) => {
  if (newApp) {
    appForm.value = {
      name: newApp.name || '',
      description: newApp.description || '',
      isActive: newApp.isActive ?? true,
    }
  }
}, { immediate: true })

async function updateApp() {
  try {
    await updateAppMutation({
      id: appId.value,
      input: {
        name: appForm.value.name.trim(),
        description: appForm.value.description?.trim() || null,
        isActive: appForm.value.isActive,
      },
    })
    // TODO: Show success toast
  }
  catch (error) {
    console.error('Error updating app:', error)
    // TODO: Show error toast
  }
}

async function regenerateApiKey() {
  try {
    await regenerateApiKeyMutation(appId.value)
    showRegenerateDialog.value = false
    // TODO: Show success toast
  }
  catch (error) {
    console.error('Error regenerating API key:', error)
    // TODO: Show error toast
  }
}

async function deleteApp() {
  if (deleteConfirmText.value !== app.value?.slug) {
    return
  }

  try {
    await deleteAppMutation(appId.value)
    showDeleteDialog.value = false
    navigateTo('/apps')
    // TODO: Show success toast
  }
  catch (error) {
    console.error('Error deleting app:', error)
    // TODO: Show error toast
  }
}

const isFormDirty = computed(() => {
  if (!app.value)
    return false

  return (
    appForm.value.name !== app.value.name
    || appForm.value.description !== (app.value.description || '')
    || appForm.value.isActive !== app.value.isActive
  )
})

const canDelete = computed(() => {
  return deleteConfirmText.value === app.value?.slug
})

async function copyAppId() {
  try {
    await navigator.clipboard.writeText(app.value?.id || '')
    isAppIdCopied.value = true
    setTimeout(() => {
      isAppIdCopied.value = false
    }, 2000)
  }
  catch (error) {
    console.error('Failed to copy App ID:', error)
  }
}
</script>

<template>
  <div v-if="app">
    <!-- App Header -->
    <AppDetailHeader :app="app" />

    <!-- Navigation -->
    <AppNavigation :app-id="appId" />

    <!-- Settings Content -->
    <div class="space-y-6">
      <div>
        <h2 class="text-2xl font-bold mb-2">Configurações do App</h2>
        <p class="text-muted-foreground">Configure as definições e preferências do seu aplicativo.</p>
      </div>

      <!-- General Settings -->
      <Card>
        <CardHeader>
          <CardTitle>Informações Gerais</CardTitle>
          <CardDescription>Informações básicas sobre o seu aplicativo</CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label for="app-name">Nome do App</Label>
              <Input
                id="app-name"
                v-model="appForm.name"
                placeholder="Meu App Incrível"
                :disabled="isUpdatingApp"
              />
            </div>
            <div class="space-y-2">
              <Label for="app-slug">Slug</Label>
              <Input
                id="app-slug"
                :model-value="app.slug"
                readonly
                class="bg-muted"
              />
              <p class="text-xs text-muted-foreground">O slug não pode ser alterado após a criação</p>
            </div>
          </div>

          <div class="space-y-2">
            <Label for="app-id">ID do App</Label>
            <div class="flex items-center gap-2">
              <Input
                id="app-id"
                :model-value="app.id"
                readonly
                class="bg-muted font-mono text-sm"
              />
              <Button
                variant="outline"
                size="icon"
                :disabled="isAppIdCopied"
                @click="copyAppId"
              >
                <Icon v-if="isAppIdCopied" name="lucide:check" class="size-4 text-green-600" />
                <Icon v-else name="lucide:copy" class="size-4" />
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">Use este ID para configurar o plugin do WordPress</p>
          </div>

          <div class="space-y-2">
            <Label for="app-description">Descrição</Label>
            <Textarea
              id="app-description"
              v-model="appForm.description"
              placeholder="Uma breve descrição do seu app..."
              rows="3"
              :disabled="isUpdatingApp"
            />
          </div>

          <div class="flex items-center space-x-2">
            <Switch
              id="app-active"
              v-model:checked="appForm.isActive"
              :disabled="isUpdatingApp"
            />
            <Label for="app-active">App está ativo</Label>
          </div>
          <p class="text-xs text-muted-foreground">Apps inativos não podem receber ou enviar notificações</p>

          <div class="flex justify-end">
            <Button
              :disabled="!isFormDirty || isUpdatingApp || !appForm.name.trim()"
              @click="updateApp"
            >
              <Icon v-if="isUpdatingApp" name="lucide:loader-2" class="mr-2 size-4 animate-spin" />
              <Icon v-else name="lucide:save" class="mr-2 size-4" />
              Salvar Alterações
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- API Key Management -->
      <Card>
        <CardHeader>
          <CardTitle>Gerenciamento de API Key</CardTitle>
          <CardDescription>Gerencie a chave de API do seu aplicativo para autenticação</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex items-center justify-between p-4 border rounded-lg">
            <div class="space-y-1">
              <h4 class="font-medium">Chave de API Atual</h4>
              <p class="text-sm text-muted-foreground">
                ID da Chave: <code class="bg-muted px-1 rounded">{{ app.apiKey?.substring(0, 12) }}...</code>
              </p>
              <p class="text-xs text-muted-foreground">Criado em: {{ new Date(app.createdAt).toLocaleDateString('pt-BR') }}</p>
            </div>
            <Button variant="outline" :disabled="isRegeneratingKey" @click="showRegenerateDialog = true">
              <Icon name="lucide:key" class="mr-2 size-4" />
              Regerar
            </Button>
          </div>

          <Alert>
            <Icon name="lucide:alert-triangle" class="size-4" />
            <AlertTitle>Aviso</AlertTitle>
            <AlertDescription>
              Regerar sua chave de API invalidará a chave atual. Certifique-se de atualizar seus aplicativos com a nova chave.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <!-- Usage Statistics -->
      <Card>
        <CardHeader>
          <CardTitle>Estatísticas de Uso</CardTitle>
          <CardDescription>Uso atual e limites para o seu aplicativo</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="space-y-2">
              <Label class="text-sm font-medium">Total de Dispositivos</Label>
              <div class="text-2xl font-bold">{{ app.stats?.totalDevices || 0 }}</div>
            </div>
            <div class="space-y-2">
              <Label class="text-sm font-medium">Notificações Enviadas</Label>
              <div class="text-2xl font-bold">{{ app.stats?.sentToday || 0 }}</div>
            </div>
            <div class="space-y-2">
              <Label class="text-sm font-medium">Chamadas de API</Label>
              <div class="text-2xl font-bold">{{ app.stats?.apiCalls || 0 }}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Danger Zone -->
      <Card class="border-destructive">
        <CardHeader>
          <CardTitle class="text-destructive">Zona de Perigo</CardTitle>
          <CardDescription>Ações irreversíveis e destrutivas</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex items-center justify-between p-4 border border-destructive rounded-lg">
            <div class="space-y-1">
              <h4 class="font-medium text-destructive">Excluir Aplicativo</h4>
              <p class="text-sm text-muted-foreground">
                Excluir permanentemente este aplicativo e todos os seus dados. Esta ação não pode ser desfeita.
              </p>
            </div>
            <Button variant="destructive" :disabled="isDeletingApp" @click="showDeleteDialog = true">
              <Icon name="lucide:trash-2" class="mr-2 size-4" />
              Excluir App
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Regenerate API Key Dialog -->
    <Dialog v-model:open="showRegenerateDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regerar Chave de API</DialogTitle>
          <DialogDescription>
            Isso gerará uma nova chave de API e invalidará a atual. Certifique-se de atualizar seus aplicativos com a nova chave.
          </DialogDescription>
        </DialogHeader>
        <Alert>
          <Icon name="lucide:alert-triangle" class="size-4" />
          <AlertTitle>Esta ação não pode ser desfeita</AlertTitle>
          <AlertDescription>
            Sua chave de API atual parará de funcionar imediatamente após a regeração.
          </AlertDescription>
        </Alert>
        <DialogFooter>
          <Button variant="outline" @click="showRegenerateDialog = false">Cancelar</Button>
          <Button :disabled="isRegeneratingKey" @click="regenerateApiKey">
            <Icon v-if="isRegeneratingKey" name="lucide:loader-2" class="mr-2 size-4 animate-spin" />
            <Icon v-else name="lucide:key" class="mr-2 size-4" />
            Regerar Chave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete App Dialog -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir Aplicativo</DialogTitle>
          <DialogDescription>
            Esta ação não pode ser desfeita. Isso excluirá permanentemente o aplicativo e todos os seus dados.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <Alert variant="destructive">
            <Icon name="lucide:alert-triangle" class="size-4" />
            <AlertTitle>Aviso</AlertTitle>
            <AlertDescription>
              Isso excluirá todos os dispositivos, notificações e configurações associados a este app.
            </AlertDescription>
          </Alert>
          <div class="space-y-2">
            <Label for="delete-confirm">
              Digite <code class="bg-muted px-1 rounded">{{ app.slug }}</code> para confirmar:
            </Label>
            <Input
              id="delete-confirm"
              v-model="deleteConfirmText"
              placeholder="Digite o slug do app aqui"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showDeleteDialog = false">Cancelar</Button>
          <Button variant="destructive" :disabled="!canDelete || isDeletingApp" @click="deleteApp">
            <Icon v-if="isDeletingApp" name="lucide:loader-2" class="mr-2 size-4 animate-spin" />
            <Icon v-else name="lucide:trash-2" class="mr-2 size-4" />
            Excluir Aplicativo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>

  <!-- Loading State -->
  <div v-else class="flex items-center justify-center h-64">
    <Icon name="lucide:loader-2" class="h-8 w-8 animate-spin" />
  </div>
</template>
