<script setup lang="ts">
import { Badge } from 'abckit/shadcn/badge'
import { Button } from 'abckit/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from 'abckit/shadcn/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from 'abckit/shadcn/dialog'
import { Input } from 'abckit/shadcn/input'
import { Label } from 'abckit/shadcn/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'abckit/shadcn/select'
import { Switch } from 'abckit/shadcn/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'abckit/shadcn/table'
import { Textarea } from 'abckit/shadcn/textarea'
import { useAutomations, useCreateAutomation, useDeleteAutomation, useToggleAutomation } from '~/graphql/automations'
import { useApp } from '~/graphql/apps'
import { useToast } from '~/composables/useToast'

definePageMeta({
  layout: 'default',
})

const route = useRoute()
const appId = computed(() => route.params.id as string)
const toast = useToast()

// API queries
const { data: appData } = useApp(appId)
const app = computed(() => appData.value)

const { data: automationsData, isLoading: automationsLoading, refetch: refetchAutomations } = useAutomations(appId)
const automations = computed(() => automationsData.value || [])

// Dialog state
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const selectedAutomation = ref<any>(null)

// Form state
const formData = ref({
  name: '',
  description: '',
  type: 'SUBSCRIPTION' as 'SUBSCRIPTION' | 'RECURRING',
  notificationTemplate: {
    title: '',
    body: '',
    data: null as any,
    imageUrl: '',
    clickAction: '',
    sound: '',
    badge: null as number | null,
  },
  delayMinutes: null as number | null,
  frequency: 'DAILY' as 'DAILY' | 'WEEKLY' | null,
  timeOfDay: '',
  daysOfWeek: [] as number[],
  startDate: '',
  endDate: '',
})

// Mutations
const createAutomationMutation = useCreateAutomation()
const deleteAutomationMutation = useDeleteAutomation()
const toggleAutomationMutation = useToggleAutomation()

// Methods
function openCreateDialog() {
  resetForm()
  showCreateDialog.value = true
}

function openEditDialog(automation: any) {
  selectedAutomation.value = automation
  formData.value = {
    name: automation.name,
    description: automation.description || '',
    type: automation.type,
    notificationTemplate: automation.notificationTemplate || {
      title: '',
      body: '',
      data: null,
      imageUrl: '',
      clickAction: '',
      sound: '',
      badge: null,
    },
    delayMinutes: automation.delayMinutes,
    frequency: automation.frequency,
    timeOfDay: automation.timeOfDay || '',
    daysOfWeek: (automation.daysOfWeek as number[]) || [],
    startDate: automation.startDate || '',
    endDate: automation.endDate || '',
  }
  showEditDialog.value = true
}

function resetForm() {
  formData.value = {
    name: '',
    description: '',
    type: 'SUBSCRIPTION',
    notificationTemplate: {
      title: '',
      body: '',
      data: null,
      imageUrl: '',
      clickAction: '',
      sound: '',
      badge: null,
    },
    delayMinutes: null,
    frequency: 'DAILY',
    timeOfDay: '',
    daysOfWeek: [],
    startDate: '',
    endDate: '',
  }
}

async function handleCreate() {
  try {
    const input: any = {
      appId: appId.value,
      name: formData.value.name,
      description: formData.value.description || undefined,
      type: formData.value.type,
      notificationTemplate: formData.value.notificationTemplate,
    }

    if (formData.value.type === 'SUBSCRIPTION') {
      if (formData.value.delayMinutes !== null) {
        input.delayMinutes = formData.value.delayMinutes
      }
    }
    else if (formData.value.type === 'RECURRING') {
      input.frequency = formData.value.frequency
      input.timeOfDay = formData.value.timeOfDay
      if (formData.value.frequency === 'WEEKLY') {
        input.daysOfWeek = formData.value.daysOfWeek
      }
      if (formData.value.startDate) {
        input.startDate = formData.value.startDate
      }
      if (formData.value.endDate) {
        input.endDate = formData.value.endDate
      }
    }

    await createAutomationMutation.mutateAsync(input)
    toast.success('Automação criada com sucesso!')
    showCreateDialog.value = false
    resetForm()
    refetchAutomations()
  }
  catch (error: any) {
    toast.error(error.message || 'Erro ao criar automação')
  }
}

async function handleDelete(id: string) {
  if (!confirm('Tem certeza que deseja deletar esta automação?'))
    return

  try {
    await deleteAutomationMutation.mutateAsync(id)
    toast.success('Automação deletada com sucesso!')
    refetchAutomations()
  }
  catch (error: any) {
    toast.error(error.message || 'Erro ao deletar automação')
  }
}

async function handleToggle(id: string) {
  try {
    await toggleAutomationMutation.mutateAsync(id)
    toast.success('Status da automação atualizado!')
    refetchAutomations()
  }
  catch (error: any) {
    toast.error(error.message || 'Erro ao atualizar automação')
  }
}

function getTypeLabel(type: string) {
  return type === 'SUBSCRIPTION' ? 'Inscrição' : 'Recorrente'
}

function getFrequencyLabel(frequency: string) {
  return frequency === 'DAILY' ? 'Diária' : 'Semanal'
}

const daysOfWeekLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
</script>

<template>
  <div>
    <AppPageHeader
      :title="`Automações - ${app?.name || 'App'}`"
      subtitle="Gerencie automações de push notifications"
    />

    <div class="flex justify-between items-center mb-6">
      <div class="text-sm text-muted-foreground">
        {{ automations.length }} automação(ões) configurada(s)
      </div>
      <Button @click="openCreateDialog">
        <Icon name="lucide:plus" class="mr-2 size-4" />
        Nova Automação
      </Button>
    </div>

    <Card v-if="automationsLoading">
      <CardContent class="p-6">
        <div class="text-center text-muted-foreground">
          Carregando automações...
        </div>
      </CardContent>
    </Card>

    <Card v-else-if="automations.length === 0">
      <CardContent class="p-6">
        <div class="text-center text-muted-foreground">
          <Icon name="lucide:zap" class="mx-auto mb-4 size-12" />
          <p class="mb-4">Nenhuma automação configurada</p>
          <Button @click="openCreateDialog">
            Criar Primeira Automação
          </Button>
        </div>
      </CardContent>
    </Card>

    <div v-else class="space-y-4">
      <Card v-for="automation in automations" :key="automation.id">
        <CardHeader>
          <div class="flex justify-between items-start">
            <div>
              <CardTitle class="flex items-center gap-2">
                {{ automation.name }}
                <Badge :variant="automation.isActive ? 'default' : 'secondary'">
                  {{ automation.isActive ? 'Ativa' : 'Inativa' }}
                </Badge>
                <Badge variant="outline">
                  {{ getTypeLabel(automation.type) }}
                </Badge>
              </CardTitle>
              <CardDescription v-if="automation.description">
                {{ automation.description }}
              </CardDescription>
            </div>
            <div class="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                @click="handleToggle(automation.id)"
              >
                <Icon
                  :name="automation.isActive ? 'lucide:pause' : 'lucide:play'"
                  class="size-4"
                />
              </Button>
              <Button
                variant="outline"
                size="sm"
                @click="openEditDialog(automation)"
              >
                <Icon name="lucide:edit" class="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                @click="handleDelete(automation.id)"
              >
                <Icon name="lucide:trash" class="size-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div class="space-y-2 text-sm">
            <div v-if="automation.type === 'SUBSCRIPTION'">
              <p><strong>Delay:</strong> {{ automation.delayMinutes || 0 }} minutos</p>
            </div>
            <div v-else-if="automation.type === 'RECURRING'">
              <p><strong>Frequência:</strong> {{ getFrequencyLabel(automation.frequency || '') }}</p>
              <p v-if="automation.timeOfDay"><strong>Horário:</strong> {{ automation.timeOfDay }}</p>
              <p v-if="automation.frequency === 'WEEKLY' && automation.daysOfWeek">
                <strong>Dias:</strong>
                {{ (automation.daysOfWeek as number[]).map(d => daysOfWeekLabels[d]).join(', ') }}
              </p>
              <p v-if="automation.nextRunAt">
                <strong>Próxima execução:</strong>
                {{ new Date(automation.nextRunAt).toLocaleString('pt-BR') }}
              </p>
            </div>
            <div>
              <p><strong>Template:</strong></p>
              <p class="text-muted-foreground">
                <strong>Título:</strong> {{ automation.notificationTemplate?.title }}
              </p>
              <p class="text-muted-foreground">
                <strong>Corpo:</strong> {{ automation.notificationTemplate?.body }}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Create Dialog -->
    <Dialog v-model:open="showCreateDialog">
      <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Automação</DialogTitle>
          <DialogDescription>
            Configure uma nova automação de push notifications
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div>
            <Label for="name">Nome *</Label>
            <Input id="name" v-model="formData.name" placeholder="Ex: Boas-vindas" />
          </div>

          <div>
            <Label for="description">Descrição</Label>
            <Textarea id="description" v-model="formData.description" placeholder="Descrição da automação" />
          </div>

          <div>
            <Label for="type">Tipo *</Label>
            <Select v-model="formData.type">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SUBSCRIPTION">Inscrição (envia quando dispositivo se registra)</SelectItem>
                <SelectItem value="RECURRING">Recorrente (envia periodicamente)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="border-t pt-4">
            <Label class="text-base font-semibold">Template da Notificação *</Label>
            <div class="space-y-4 mt-2">
              <div>
                <Label for="title">Título *</Label>
                <Input id="title" v-model="formData.notificationTemplate.title" placeholder="Título da notificação" />
              </div>
              <div>
                <Label for="body">Corpo *</Label>
                <Textarea id="body" v-model="formData.notificationTemplate.body" placeholder="Corpo da notificação" />
              </div>
            </div>
          </div>

          <div v-if="formData.type === 'SUBSCRIPTION'" class="border-t pt-4">
            <Label for="delayMinutes">Delay (minutos)</Label>
            <Input
              id="delayMinutes"
              v-model.number="formData.delayMinutes"
              type="number"
              min="0"
              placeholder="0"
            />
            <p class="text-xs text-muted-foreground mt-1">
              Tempo de espera antes de enviar a notificação após o registro
            </p>
          </div>

          <div v-if="formData.type === 'RECURRING'" class="border-t pt-4 space-y-4">
            <div>
              <Label for="frequency">Frequência *</Label>
              <Select v-model="formData.frequency">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DAILY">Diária</SelectItem>
                  <SelectItem value="WEEKLY">Semanal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label for="timeOfDay">Horário (HH:MM) *</Label>
              <Input id="timeOfDay" v-model="formData.timeOfDay" placeholder="09:00" />
            </div>

            <div v-if="formData.frequency === 'WEEKLY'">
              <Label>Dias da Semana *</Label>
              <div class="flex flex-wrap gap-2 mt-2">
                <Button
                  v-for="(label, index) in daysOfWeekLabels"
                  :key="index"
                  :variant="formData.daysOfWeek.includes(index) ? 'default' : 'outline'"
                  size="sm"
                  @click="
                    if (formData.daysOfWeek.includes(index)) {
                      formData.daysOfWeek = formData.daysOfWeek.filter(d => d !== index)
                    } else {
                      formData.daysOfWeek.push(index)
                    }
                  "
                >
                  {{ label }}
                </Button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <Label for="startDate">Data de Início</Label>
                <Input id="startDate" v-model="formData.startDate" type="date" />
              </div>
              <div>
                <Label for="endDate">Data de Fim</Label>
                <Input id="endDate" v-model="formData.endDate" type="date" />
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-4">
            <Button variant="outline" @click="showCreateDialog = false">
              Cancelar
            </Button>
            <Button
              :disabled="!formData.name || !formData.notificationTemplate.title || !formData.notificationTemplate.body"
              @click="handleCreate"
            >
              Criar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

