<script setup lang="ts">
import { Badge } from 'abckit/shadcn/badge'
import { Button } from 'abckit/shadcn/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from 'abckit/shadcn/dialog'
import { Input } from 'abckit/shadcn/input'
import { Label } from 'abckit/shadcn/label'
import { Textarea } from 'abckit/shadcn/textarea'

interface Props {
  app: any
}

const _props = defineProps<Props>()

// Reactive data
const showSendTest = ref(false)
const testNotification = ref({
  title: '',
  body: '',
})

async function sendTestNotification() {
  try {
    // TODO: Implement test notification sending
    console.log('Send test notification:', testNotification.value)
    showSendTest.value = false
    testNotification.value = { title: '', body: '' }
  }
  catch (error) {
    console.error('Error sending test notification:', error)
  }
}
</script>

<template>
  <div class="flex items-center justify-between mb-8">
    <div class="flex items-center space-x-4">
      <Button variant="ghost" size="icon" @click="$router.back()">
        <Icon name="lucide:arrow-left" class="size-4" />
      </Button>
      <div>
        <h1 class="text-3xl font-bold mb-1">{{ app.name }}</h1>
        <p class="text-muted-foreground">{{ app.slug }}</p>
      </div>
      <Badge :variant="app.isActive ? 'default' : 'secondary'">
        {{ app.isActive ? 'Ativo' : 'Inativo' }}
      </Badge>
    </div>
    <div class="flex space-x-2">
      <Button variant="outline" @click="showSendTest = true">
        <Icon name="lucide:send" class="mr-2 size-4" />
        Enviar Teste
      </Button>
      <Button variant="outline">
        <Icon name="lucide:download" class="mr-2 size-4" />
        Exportar Dados
      </Button>
    </div>
  </div>

  <!-- Send Test Dialog -->
  <Dialog v-model:open="showSendTest">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Enviar Notificação de Teste</DialogTitle>
        <DialogDescription>Enviar notificação de teste para {{ app.name }}</DialogDescription>
      </DialogHeader>
      <div class="space-y-4">
        <div class="space-y-2">
          <Label for="test-title">Título</Label>
          <Input
            id="test-title"
            v-model="testNotification.title"
            placeholder="Olá Mundo!"
          />
        </div>
        <div class="space-y-2">
          <Label for="test-body">Mensagem</Label>
          <Textarea
            id="test-body"
            v-model="testNotification.body"
            placeholder="Esta é uma notificação de teste"
            rows="3"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="showSendTest = false">Cancelar</Button>
        <Button @click="sendTestNotification">Enviar Teste</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
