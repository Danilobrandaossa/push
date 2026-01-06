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

const { mutateAsync: configureFCMMutation, isLoading: isConfiguring } = useConfigureFCM()

// Form validation schema
const formSchema = z.object({
  projectId: z.string().min(1, 'ID do Projeto é obrigatório'),
  serviceAccount: z.string().min(1, 'JSON da conta de serviço é obrigatório').refine(
    (val) => {
      try {
        const parsed = JSON.parse(val)
        return parsed.type === 'service_account' && parsed.project_id && parsed.private_key_id
      }
      catch {
        return false
      }
    },
    'Formato JSON da conta de serviço inválido',
  ),
})

// Form setup
const { handleSubmit, isSubmitting, setValues, setFieldValue, values } = useForm({
  validationSchema: formSchema,
  initialValues: {
    projectId: '',
    serviceAccount: '',
  },
})

// Watch for app data and populate form
watch(app, (newApp) => {
  if (newApp && newApp.fcmProjectId) {
    setValues({
      projectId: newApp.fcmProjectId || '',
      serviceAccount: newApp.fcmServiceAccount || '',
    })
  }
}, { immediate: true })

// File upload handling
const fileInput = ref<HTMLInputElement>()

function handleFileUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file && file.type === 'application/json') {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      setFieldValue('serviceAccount', content)

      // Try to extract project ID from the JSON
      try {
        const parsed = JSON.parse(content)
        if (parsed.project_id) {
          setFieldValue('projectId', parsed.project_id)
        }
      }
      catch {
        // Ignore parsing errors
      }
    }
    reader.readAsText(file)
  }
}

function triggerFileUpload() {
  fileInput.value?.click()
}

// Form submission
const onSubmit = handleSubmit(async (values) => {
  try {
    await configureFCMMutation({
      id: appId.value,
      input: {
        projectId: values.projectId.trim(),
        serviceAccount: values.serviceAccount.trim(),
      },
    })

    // TODO: Show success toast
    console.log('FCM configured successfully')

    // Navigate back to providers page
    await router.push(`/apps/${appId.value}/providers`)
  }
  catch (error) {
    console.error('Error configuring FCM:', error)
    // TODO: Show error toast
  }
})

function goBack() {
  router.push(`/apps/${appId.value}/providers`)
}

// Check if app has existing FCM configuration
const hasExistingConfig = computed(() => {
  return app.value?.fcmProjectId
})

// Parse service account to show info
const serviceAccountInfo = computed(() => {
  try {
    const formValues = values
    if (formValues?.serviceAccount) {
      return JSON.parse(formValues.serviceAccount)
    }
  }
  catch {
    // Ignore parsing errors
  }
  return null
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
        <h1 class="text-3xl font-bold mb-1">Configurar Firebase FCM</h1>
        <p class="text-muted-foreground">Configure notificações push para dispositivos Android</p>
      </div>
    </div>

    <!-- Configuration Form -->
    <div class="max-w-2xl space-y-6">
      <!-- Current Status -->
      <Card v-if="hasExistingConfig">
        <CardHeader>
          <CardTitle class="flex items-center space-x-2">
            <Icon name="lucide:check" class="h-5 w-5 text-green-600" />
            <span>FCM Atualmente Configurado</span>
          </CardTitle>
          <CardDescription>Seu app está configurado para enviar notificações push para Android</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-2">
            <p class="text-sm"><strong>Project ID:</strong> {{ app.fcmProjectId }}</p>
            <p class="text-sm text-muted-foreground">As credenciais da conta de serviço estão armazenadas e criptografadas com segurança.</p>
          </div>
        </CardContent>
      </Card>

      <!-- Configuration Guide -->
      <Card>
        <CardHeader>
          <CardTitle>Guia de Configuração</CardTitle>
          <CardDescription>Siga estes passos para obter suas credenciais FCM no Console do Firebase</CardDescription>
        </CardHeader>
        <CardContent>
          <ol class="space-y-3 text-sm">
            <li class="flex items-start space-x-3">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</span>
              <div>
                <p class="font-medium">Vá para o Console do Firebase</p>
                <p class="text-muted-foreground">Visite console.firebase.google.com e selecione seu projeto</p>
              </div>
            </li>
            <li class="flex items-start space-x-3">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</span>
              <div>
                <p class="font-medium">Navegue até Configurações do Projeto</p>
                <p class="text-muted-foreground">Clique no ícone de engrenagem e selecione "Configurações do projeto"</p>
              </div>
            </li>
            <li class="flex items-start space-x-3">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">3</span>
              <div>
                <p class="font-medium">Gere a Chave do SDK Admin do Firebase</p>
                <div class="text-muted-foreground space-y-1">
                  <p>• Clique na aba "Contas de serviço"</p>
                  <p>• Encontre a seção "SDK Admin do Firebase"</p>
                  <p>• Clique no botão "Gerar nova chave privada"</p>
                  <p>• Confirme na caixa de diálogo</p>
                </div>
              </div>
            </li>
            <li class="flex items-start space-x-3">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">4</span>
              <div>
                <p class="font-medium">Baixe o arquivo JSON</p>
                <p class="text-muted-foreground">Baixe o arquivo JSON da conta de serviço e faça o upload abaixo</p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>

      <!-- Configuration Form -->
      <Card>
        <CardHeader>
          <CardTitle>Configuração FCM</CardTitle>
          <CardDescription>Insira suas credenciais do Firebase Cloud Messaging</CardDescription>
        </CardHeader>
        <CardContent>
          <form class="space-y-6" @submit="onSubmit">
            <!-- Project ID -->
            <FormField v-slot="{ componentField }" name="projectId">
              <FormItem>
                <FormLabel class="required">Project ID</FormLabel>
                <FormControl>
                  <Input
                    v-bind="componentField"
                    placeholder="meu-projeto-firebase"
                    :disabled="isSubmitting || isConfiguring"
                  />
                </FormControl>
                <FormDescription>
                  Seu ID do projeto Firebase (preenchido automaticamente ao fazer upload do arquivo da conta de serviço)
                </FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>

            <!-- Service Account JSON -->
            <FormField v-slot="{ componentField }" name="serviceAccount">
              <FormItem>
                <FormLabel class="required">JSON da Conta de Serviço</FormLabel>
                <div class="space-y-3">
                  <!-- File Upload Button -->
                  <Button type="button" variant="outline" :disabled="isSubmitting || isConfiguring" @click="triggerFileUpload">
                    <Icon name="lucide:upload" class="mr-2 size-4" />
                    Carregar Arquivo JSON
                  </Button>
                  <input
                    ref="fileInput"
                    type="file"
                    accept=".json,application/json"
                    class="hidden"
                    @change="handleFileUpload"
                  />

                  <!-- Manual Textarea -->
                  <FormControl>
                    <Textarea
                      v-bind="componentField"
                      placeholder="{&quot;type&quot;: &quot;service_account&quot;, &quot;project_id&quot;: &quot;seu-projeto&quot;, ...}"
                      rows="12"
                      class="font-mono text-xs"
                      :disabled="isSubmitting || isConfiguring"
                    />
                  </FormControl>
                </div>
                <FormDescription>
                  Faça upload do arquivo JSON da conta de serviço do Console do Firebase ou cole o conteúdo manualmente
                </FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>

            <!-- Service Account Info (if valid JSON) -->
            <Card v-if="serviceAccountInfo" class="bg-muted/50">
              <CardHeader>
                <CardTitle class="text-sm">Informações da Conta de Serviço</CardTitle>
              </CardHeader>
              <CardContent class="space-y-2 text-sm">
                <p><strong>Project ID:</strong> {{ serviceAccountInfo.project_id }}</p>
                <p><strong>Client Email:</strong> {{ serviceAccountInfo.client_email }}</p>
                <p><strong>Private Key ID:</strong> {{ serviceAccountInfo.private_key_id?.substring(0, 8) }}...</p>
                <p><strong>Tipo:</strong> {{ serviceAccountInfo.type }}</p>
              </CardContent>
            </Card>

            <!-- Security Warning -->
            <Alert>
              <Icon name="lucide:alert-triangle" class="size-4" />
              <AlertTitle>Aviso de Segurança</AlertTitle>
              <AlertDescription>
                As credenciais da sua conta de serviço serão criptografadas e armazenadas com segurança. Nunca compartilhe essas credenciais publicamente ou as coloque no controle de versão.
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
                {{ hasExistingConfig ? 'Atualizar Configuração' : 'Salvar Configuração' }}
              </Button>
              <Button type="button" variant="outline" @click="goBack">
                Cancelar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <!-- Additional Resources -->
      <Card>
        <CardHeader>
          <CardTitle>Recursos Adicionais</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <a
              href="https://firebase.google.com/docs/cloud-messaging/server"
              target="_blank"
              class="flex items-center space-x-2 text-sm text-primary hover:underline"
            >
              <Icon name="lucide:file-text" class="size-4" />
              <span>Documentação Firebase Cloud Messaging</span>
            </a>
            <a
              href="https://console.firebase.google.com/"
              target="_blank"
              class="flex items-center space-x-2 text-sm text-primary hover:underline"
            >
              <Icon name="lucide:file-text" class="size-4" />
              <span>Console Firebase</span>
            </a>
            <a
              href="https://firebase.google.com/docs/cloud-messaging/auth-server"
              target="_blank"
              class="flex items-center space-x-2 text-sm text-primary hover:underline"
            >
              <Icon name="lucide:file-text" class="size-4" />
              <span>Guia de Autenticação do Servidor</span>
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
