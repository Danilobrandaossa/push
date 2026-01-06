<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from 'abckit/shadcn/card'

definePageMeta({
  layout: 'default',
})

// API mutations
const { mutateAsync: createAppMutation, isLoading: isCreatingApp } = useCreateApp()

// Methods
async function handleSubmit(formData: any) {
  try {
    const result = await createAppMutation(formData)

    console.log('App created successfully!', result)

    // Navigate to the new app's page
    if (result?.id) {
      await navigateTo(`/apps/${result.id}`)
    }
  }
  catch (error) {
    console.error('Error creating app:', error)
    // TODO: Show error toast
  }
}

function goBack() {
  navigateTo('/apps')
}
</script>

<template>
  <div>
    <!-- App Page Header -->
    <AppPageHeader
      title="Criar App"
      subtitle="Registre um novo aplicativo para notificações push"
      badge="Criando"
      @back="goBack"
    />

    <div class="max-w-2xl">
      <FormsCreateAppForm
        :loading="isCreatingApp"
        @submit="handleSubmit"
        @cancel="goBack"
      />

      <!-- What's Next Card -->
      <Card class="mt-6">
        <CardHeader>
          <CardTitle>Próximos Passos</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <div class="flex items-start space-x-3">
              <div class="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</div>
              <div>
                <p class="font-medium">Configurar Provedores de Push</p>
                <p class="text-sm text-muted-foreground">Configure as credenciais do FCM, APNs ou Web Push para suas plataformas</p>
              </div>
            </div>
            <div class="flex items-start space-x-3">
              <div class="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</div>
              <div>
                <p class="font-medium">Obter Chave de API</p>
                <p class="text-sm text-muted-foreground">Use a chave de API gerada para autenticar suas requisições</p>
              </div>
            </div>
            <div class="flex items-start space-x-3">
              <div class="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</div>
              <div>
                <p class="font-medium">Registrar Dispositivos</p>
                <p class="text-sm text-muted-foreground">Comece a registrar os dispositivos dos usuários para receber notificações</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
