<script setup lang="ts">
import { Alert, AlertDescription, AlertTitle } from 'abckit/shadcn/alert'
import { Button } from 'abckit/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'abckit/shadcn/card'

import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from 'abckit/shadcn/form'
import { Input } from 'abckit/shadcn/input'
import { Switch } from 'abckit/shadcn/switch'
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

const { mutateAsync: configureAPNsMutation, isLoading: isConfiguring } = useConfigureAPNs()

// Form validation schema
const formSchema = z.object({
  keyId: z.string().min(1, 'Key ID é obrigatório').max(10, 'Key ID deve ter 10 caracteres'),
  teamId: z.string().min(1, 'Team ID é obrigatório').max(10, 'Team ID deve ter 10 caracteres'),
  privateKey: z.string().min(1, 'Chave privada é obrigatória'),
  bundleId: z.string().optional(),
  isProduction: z.boolean().default(false),
})

// Form setup
const { handleSubmit, isSubmitting, setValues } = useForm({
  validationSchema: formSchema,
  initialValues: {
    keyId: '',
    teamId: '',
    privateKey: '',
    bundleId: '',
    isProduction: false,
  },
})

// Watch for app data and populate form
watch(app, (newApp) => {
  if (newApp && newApp.apnsKeyId) {
    setValues({
      keyId: newApp.apnsKeyId || '',
      teamId: newApp.apnsTeamId || '',
      privateKey: newApp.apnsPrivateKey || '',
      bundleId: newApp.bundleId || '',
      isProduction: false, // Default since we don't store this in DB yet
    })
  }
}, { immediate: true })

// Form submission
const onSubmit = handleSubmit(async (values) => {
  try {
    await configureAPNsMutation({
      id: appId.value,
      input: {
        keyId: values.keyId.trim(),
        teamId: values.teamId.trim(),
        privateKey: values.privateKey.trim(),
        bundleId: values.bundleId?.trim(),
        isProduction: values.isProduction,
      },
    })

    // TODO: Show success toast
    console.log('APNs configured successfully')

    // Navigate back to providers page
    await router.push(`/apps/${appId.value}/providers`)
  }
  catch (error) {
    console.error('Error configuring APNs:', error)
    // TODO: Show error toast
  }
})

function goBack() {
  router.push(`/apps/${appId.value}/providers`)
}

// Check if app has existing APNs configuration
const hasExistingConfig = computed(() => {
  return app.value?.apnsKeyId && app.value?.apnsTeamId
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
        <h1 class="text-3xl font-bold mb-1">Configurar Apple APNs</h1>
        <p class="text-muted-foreground">Configure notificações push para dispositivos iOS</p>
      </div>
    </div>

    <!-- Configuration Form -->
    <div class="max-w-2xl space-y-6">
      <!-- Current Status -->
      <Card v-if="hasExistingConfig">
        <CardHeader>
          <CardTitle class="flex items-center space-x-2">
            <Icon name="lucide:check" class="h-5 w-5 text-green-600" />
            <span>APNs Atualmente Configurado</span>
          </CardTitle>
          <CardDescription>Seu app está configurado para enviar notificações push para dispositivos iOS</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-2">
            <p class="text-sm"><strong>Key ID:</strong> {{ app.apnsKeyId }}</p>
            <p class="text-sm"><strong>Team ID:</strong> {{ app.apnsTeamId }}</p>
            <p class="text-sm text-muted-foreground">Chave privada armazenada e criptografada com segurança.</p>
          </div>
        </CardContent>
      </Card>

      <!-- Configuration Guide -->
      <Card>
        <CardHeader>
          <CardTitle>Guia de Configuração</CardTitle>
          <CardDescription>Siga estes passos para obter suas credenciais APNs do Console de Desenvolvedor da Apple</CardDescription>
        </CardHeader>
        <CardContent>
          <ol class="space-y-3 text-sm">
            <li class="flex items-start space-x-3">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">1</span>
              <div>
                <p class="font-medium">Entre no Console de Desenvolvedor da Apple</p>
                <p class="text-muted-foreground">Vá para developer.apple.com e faça login com sua conta de desenvolvedor</p>
              </div>
            </li>
            <li class="flex items-start space-x-3">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">2</span>
              <div>
                <p class="font-medium">Crie Chave de Autenticação APNs</p>
                <p class="text-muted-foreground">Navegue até a seção Keys e crie uma nova chave com o serviço APNs ativado</p>
              </div>
            </li>
            <li class="flex items-start space-x-3">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">3</span>
              <div>
                <p class="font-medium">Baixe o arquivo .p8</p>
                <p class="text-muted-foreground">Baixe o arquivo da chave privada e anote seu Key ID e Team ID</p>
              </div>
            </li>
            <li class="flex items-start space-x-3">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">4</span>
              <div>
                <p class="font-medium">Configure abaixo</p>
                <p class="text-muted-foreground">Insira suas credenciais no formulário abaixo</p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>

      <!-- Configuration Form -->
      <Card>
        <CardHeader>
          <CardTitle>Configuração APNs</CardTitle>
          <CardDescription>Insira suas credenciais do serviço de notificação push da Apple</CardDescription>
        </CardHeader>
        <CardContent>
          <form class="space-y-6" @submit="onSubmit">
            <!-- Key ID -->
            <FormField v-slot="{ componentField }" name="keyId">
              <FormItem>
                <FormLabel class="required">Key ID</FormLabel>
                <FormControl>
                  <Input
                    v-bind="componentField"
                    placeholder="ABC1234DEF"
                    maxlength="10"
                    :disabled="isSubmitting || isConfiguring"
                  />
                </FormControl>
                <FormDescription>
                  Identificador de 10 caracteres da sua chave de autenticação APNs (encontrado no Console da Apple)
                </FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>

            <!-- Team ID -->
            <FormField v-slot="{ componentField }" name="teamId">
              <FormItem>
                <FormLabel class="required">Team ID</FormLabel>
                <FormControl>
                  <Input
                    v-bind="componentField"
                    placeholder="1234567890"
                    maxlength="10"
                    :disabled="isSubmitting || isConfiguring"
                  />
                </FormControl>
                <FormDescription>
                  Seu ID de equipe de desenvolvedor Apple (encontrado no Console da Apple)
                </FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>

            <!-- Private Key -->
            <FormField v-slot="{ componentField }" name="privateKey">
              <FormItem>
                <FormLabel class="required">Chave Privada (conteúdo do arquivo .p8)</FormLabel>
                <FormControl>
                  <Textarea
                    v-bind="componentField"
                    placeholder="-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
-----END PRIVATE KEY-----"
                    rows="8"
                    class="font-mono text-xs"
                    :disabled="isSubmitting || isConfiguring"
                  />
                </FormControl>
                <FormDescription>
                  Cole todo o conteúdo do seu arquivo de chave privada .p8 aqui
                </FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>

            <!-- Bundle ID (Optional) -->
            <FormField v-slot="{ componentField }" name="bundleId">
              <FormItem>
                <FormLabel>Bundle ID (Opcional)</FormLabel>
                <FormControl>
                  <Input
                    v-bind="componentField"
                    placeholder="com.suaempresa.seuapp"
                    :disabled="isSubmitting || isConfiguring"
                  />
                </FormControl>
                <FormDescription>
                  Identificador do seu aplicativo iOS (deixe em branco se usar certificado curinga)
                </FormDescription>
                <FormMessage />
              </FormItem>
            </FormField>

            <!-- Environment Toggle -->
            <FormField v-slot="{ componentField }" name="isProduction">
              <FormItem class="flex flex-row items-center justify-between rounded-lg border p-4">
                <div class="space-y-0.5">
                  <FormLabel class="text-base">Ambiente de Produção</FormLabel>
                  <FormDescription>
                    Usar servidores APNs de produção (recomendado para apps publicados)
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    v-bind="componentField"
                    :disabled="isSubmitting || isConfiguring"
                  />
                </FormControl>
              </FormItem>
            </FormField>

            <!-- Security Warning -->
            <Alert>
              <Icon name="lucide:alert-triangle" class="size-4" />
              <AlertTitle>Aviso de Segurança</AlertTitle>
              <AlertDescription>
                Sua chave privada será criptografada e armazenada com segurança. Recomendamos o uso de chaves específicas para cada ambiente e a rotação regular das mesmas.
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
              href="https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/establishing_a_token-based_connection_to_apns"
              target="_blank"
              class="flex items-center space-x-2 text-sm text-primary hover:underline"
            >
              <Icon name="lucide:file-text" class="size-4" />
              <span>Documentação Apple APNs</span>
            </a>
            <a
              href="https://developer.apple.com/account/resources/authkeys/list"
              target="_blank"
              class="flex items-center space-x-2 text-sm text-primary hover:underline"
            >
              <Icon name="lucide:file-text" class="size-4" />
              <span>Gerenciar Chaves de Autenticação APNs</span>
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
