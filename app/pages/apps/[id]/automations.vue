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
  notificationTemplates: [
    {
      title: '',
      body: '',
      data: '' as any,
      icon: '',
      imageUrl: '',
      clickAction: '',
      sound: 'default',
      badge: null as number | null,
      delayMinutes: 0, // Primeiro push sempre tem delay 0
    },
  ] as Array<{
    title: string
    body: string
    data: any | string // Pode ser objeto JSON ou string para edição
    icon: string
    imageUrl: string
    clickAction: string
    sound: string
    badge: number | null
    delayMinutes: number
  }>,
  frequency: 'DAILY' as 'DAILY' | 'WEEKLY' | null,
  timeOfDay: '',
  daysOfWeek: [] as number[],
  startDate: '',
  endDate: '',
})

// UI state for template expansion
const expandedTemplates = ref<Set<number>>(new Set([0]))

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
  const templates = automation.notificationTemplates || []
  
  // Se não tem templates mas tem notificationTemplate (legacy), converter
  if (templates.length === 0 && automation.notificationTemplate) {
    templates.push({
      ...automation.notificationTemplate,
      delayMinutes: automation.delayMinutes || 0,
    })
  }
  
  // Processar templates para garantir que data seja tratado corretamente
  const processedTemplates = templates.length > 0 ? templates.map((t: any) => ({
    ...t,
    data: typeof t.data === 'object' ? JSON.stringify(t.data, null, 2) : (t.data || ''),
    delayMinutes: t.delayMinutes ?? 0,
  })) : [
    {
      title: '',
      body: '',
      data: '',
      icon: '',
      imageUrl: '',
      clickAction: '',
      sound: 'default',
      badge: null,
      delayMinutes: 0,
    },
  ]
  
  formData.value = {
    name: automation.name,
    description: automation.description || '',
    type: automation.type,
    notificationTemplates: processedTemplates,
    frequency: automation.frequency,
    timeOfDay: automation.timeOfDay || '',
    daysOfWeek: (automation.daysOfWeek as number[]) || [],
    startDate: automation.startDate || '',
    endDate: automation.endDate || '',
  }
  
  // Expandir todos os templates ao editar
  expandedTemplates.value = new Set(formData.value.notificationTemplates.map((_, i) => i))
  showEditDialog.value = true
}

function resetForm() {
  formData.value = {
    name: '',
    description: '',
    type: 'SUBSCRIPTION',
    notificationTemplates: [
      {
        title: '',
        body: '',
        data: '',
        icon: '',
        imageUrl: '',
        clickAction: '',
        sound: 'default',
        badge: null,
        delayMinutes: 0,
      },
    ],
    frequency: 'DAILY',
    timeOfDay: '',
    daysOfWeek: [],
    startDate: '',
    endDate: '',
  }
  expandedTemplates.value = new Set([0])
}

function addTemplate() {
  formData.value.notificationTemplates.push({
    title: '',
    body: '',
    data: null,
    icon: '',
    imageUrl: '',
    clickAction: '',
    sound: 'default',
    badge: null,
    delayMinutes: 0,
  })
  expandedTemplates.value.add(formData.value.notificationTemplates.length - 1)
}

function removeTemplate(index: number) {
  if (formData.value.notificationTemplates.length <= 1) {
    toast.error('É necessário pelo menos um push na automação')
    return
  }
  formData.value.notificationTemplates.splice(index, 1)
  expandedTemplates.value.delete(index)
  // Ajustar índices do Set
  const newSet = new Set<number>()
  expandedTemplates.value.forEach(i => {
    if (i < index) newSet.add(i)
    else if (i > index) newSet.add(i - 1)
  })
  expandedTemplates.value = newSet
}

function toggleTemplateExpansion(index: number) {
  if (expandedTemplates.value.has(index)) {
    expandedTemplates.value.delete(index)
  }
  else {
    expandedTemplates.value.add(index)
  }
}

async function handleCreate() {
  try {
    // Validar templates
    if (formData.value.notificationTemplates.length === 0) {
      toast.error('É necessário pelo menos um push na automação')
      return
    }

    // Validar que o primeiro template tem delayMinutes = 0
    if (formData.value.notificationTemplates[0].delayMinutes !== 0) {
      formData.value.notificationTemplates[0].delayMinutes = 0
    }

    // Validar que todos os templates têm título e corpo
    for (let i = 0; i < formData.value.notificationTemplates.length; i++) {
      const template = formData.value.notificationTemplates[i]
      if (!template.title || !template.body) {
        toast.error(`O push #${i + 1} deve ter título e corpo`)
        return
      }
    }

    const input: any = {
      appId: appId.value,
      name: formData.value.name,
      description: formData.value.description || undefined,
      type: formData.value.type,
      notificationTemplates: formData.value.notificationTemplates.map(t => {
        // Parse data if it's a string
        let parsedData: any = undefined
        if (t.data) {
          if (typeof t.data === 'string' && t.data.trim()) {
            try {
              parsedData = JSON.parse(t.data)
            }
            catch {
              // If parsing fails, try to keep as string if it's valid
              parsedData = t.data.trim() || undefined
            }
          }
          else if (typeof t.data === 'object') {
            parsedData = t.data
          }
        }

        return {
          title: t.title,
          body: t.body,
          data: parsedData,
          icon: t.icon?.trim() || undefined, // Ícone da notificação
          imageUrl: t.imageUrl?.trim() || undefined, // Imagem grande
          clickAction: t.clickAction?.trim() || undefined,
          sound: t.sound?.trim() || 'default',
          badge: t.badge || undefined,
          delayMinutes: t.delayMinutes,
        }
      }),
    }

    if (formData.value.type === 'RECURRING') {
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

async function handleUpdate() {
  try {
    if (!selectedAutomation.value) return

    // Validar templates
    if (formData.value.notificationTemplates.length === 0) {
      toast.error('É necessário pelo menos um push na automação')
      return
    }

    // Validar que o primeiro template tem delayMinutes = 0
    if (formData.value.notificationTemplates[0].delayMinutes !== 0) {
      formData.value.notificationTemplates[0].delayMinutes = 0
    }

    // Validar que todos os templates têm título e corpo
    for (let i = 0; i < formData.value.notificationTemplates.length; i++) {
      const template = formData.value.notificationTemplates[i]
      if (!template.title || !template.body) {
        toast.error(`O push #${i + 1} deve ter título e corpo`)
        return
      }
    }

    const input: any = {
      name: formData.value.name,
      description: formData.value.description || undefined,
      notificationTemplates: formData.value.notificationTemplates.map(t => {
        // Parse data if it's a string
        let parsedData: any = undefined
        if (t.data) {
          if (typeof t.data === 'string' && t.data.trim()) {
            try {
              parsedData = JSON.parse(t.data)
            }
            catch {
              // If parsing fails, try to keep as string if it's valid
              parsedData = t.data.trim() || undefined
            }
          }
          else if (typeof t.data === 'object') {
            parsedData = t.data
          }
        }

        return {
          title: t.title,
          body: t.body,
          data: parsedData,
          icon: t.icon?.trim() || undefined, // Ícone da notificação
          imageUrl: t.imageUrl?.trim() || undefined, // Imagem grande
          clickAction: t.clickAction?.trim() || undefined,
          sound: t.sound?.trim() || 'default',
          badge: t.badge || undefined,
          delayMinutes: t.delayMinutes,
        }
      }),
    }

    if (formData.value.type === 'RECURRING') {
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

    // Usar useUpdateAutomation
    const { useUpdateAutomation } = await import('~/graphql/automations')
    const updateMutation = useUpdateAutomation()
    await updateMutation.mutateAsync({ id: selectedAutomation.value.id, input })
    toast.success('Automação atualizada com sucesso!')
    showEditDialog.value = false
    resetForm()
    refetchAutomations()
  }
  catch (error: any) {
    toast.error(error.message || 'Erro ao atualizar automação')
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

function toggleDayOfWeek(dayIndex: number) {
  if (formData.value.daysOfWeek.includes(dayIndex)) {
    formData.value.daysOfWeek = formData.value.daysOfWeek.filter(d => d !== dayIndex)
  }
  else {
    formData.value.daysOfWeek.push(dayIndex)
  }
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
            <div v-if="automation.type === 'RECURRING'">
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
              <p><strong>Pushes:</strong> {{ (automation.notificationTemplates || []).length }}</p>
              <div v-if="automation.notificationTemplates && automation.notificationTemplates.length > 0" class="mt-2 space-y-1">
                <div
                  v-for="(template, index) in automation.notificationTemplates"
                  :key="index"
                  class="text-xs p-2 bg-muted rounded"
                >
                  <p><strong>Push #{{ index + 1 }}</strong> (delay: {{ template.delayMinutes || 0 }}min)</p>
                  <p class="text-muted-foreground">{{ template.title }}</p>
                </div>
              </div>
              <!-- Fallback para formato antigo -->
              <div v-else-if="automation.notificationTemplate" class="mt-2 text-xs p-2 bg-muted rounded">
                <p><strong>Push #1</strong></p>
                <p class="text-muted-foreground">{{ automation.notificationTemplate.title }}</p>
              </div>
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
            <div class="flex justify-between items-center mb-4">
              <Label class="text-base font-semibold">Pushes da Automação *</Label>
              <Button type="button" variant="outline" size="sm" @click="addTemplate">
                <Icon name="lucide:plus" class="mr-2 size-4" />
                Adicionar Push
              </Button>
            </div>

            <div class="space-y-4">
              <Card
                v-for="(template, index) in formData.notificationTemplates"
                :key="index"
                class="relative"
              >
                <CardHeader class="pb-3">
                  <div class="flex justify-between items-center">
                    <CardTitle class="text-base">
                      Push #{{ index + 1 }}
                      <Badge v-if="index === 0" variant="secondary" class="ml-2">Primeiro (delay: 0)</Badge>
                      <Badge v-else variant="outline" class="ml-2">
                        Delay: {{ template.delayMinutes || 0 }}min
                      </Badge>
                    </CardTitle>
                    <div class="flex gap-2">
                      <Button
                        v-if="formData.notificationTemplates.length > 1"
                        variant="ghost"
                        size="sm"
                        @click="removeTemplate(index)"
                      >
                        <Icon name="lucide:trash" class="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        @click="toggleTemplateExpansion(index)"
                      >
                        <Icon
                          :name="expandedTemplates.has(index) ? 'lucide:chevron-up' : 'lucide:chevron-down'"
                          class="size-4"
                        />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent v-if="expandedTemplates.has(index)" class="space-y-4">
                  <div>
                    <Label :for="`title-${index}`">Título *</Label>
                    <Input
                      :id="`title-${index}`"
                      v-model="template.title"
                      placeholder="Título da notificação"
                    />
                  </div>

                  <div>
                    <Label :for="`body-${index}`">Corpo *</Label>
                    <Textarea
                      :id="`body-${index}`"
                      v-model="template.body"
                      placeholder="Corpo da notificação"
                      rows="3"
                    />
                  </div>

                  <div v-if="index > 0">
                    <Label :for="`delay-${index}`">Delay após push anterior (minutos) *</Label>
                    <Input
                      :id="`delay-${index}`"
                      v-model.number="template.delayMinutes"
                      type="number"
                      min="0"
                      placeholder="0"
                    />
                    <p class="text-xs text-muted-foreground mt-1">
                      Tempo de espera após o push anterior ser enviado
                    </p>
                  </div>

                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <Label :for="`badge-${index}`">Badge Count</Label>
                      <Input
                        :id="`badge-${index}`"
                        v-model.number="template.badge"
                        type="number"
                        min="0"
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <Label :for="`sound-${index}`">Sound</Label>
                      <Input
                        :id="`sound-${index}`"
                        v-model="template.sound"
                        placeholder="default"
                      />
                    </div>
                  </div>

                  <div>
                    <Label :for="`clickAction-${index}`">Click Action (URL)</Label>
                    <Input
                      :id="`clickAction-${index}`"
                      v-model="template.clickAction"
                      placeholder="https://example.com"
                    />
                  </div>

                  <div>
                    <Label :for="`icon-${index}`">Ícone (Icon URL)</Label>
                    <Input
                      :id="`icon-${index}`"
                      v-model="template.icon"
                      placeholder="https://example.com/icon.png"
                    />
                    <p class="text-xs text-muted-foreground mt-1">
                      URL do ícone que aparece na notificação (substitui o ícone padrão do navegador)
                    </p>
                  </div>

                  <div>
                    <Label :for="`imageUrl-${index}`">Imagem Grande (Image URL)</Label>
                    <Input
                      :id="`imageUrl-${index}`"
                      v-model="template.imageUrl"
                      placeholder="https://example.com/image.png"
                    />
                    <p class="text-xs text-muted-foreground mt-1">
                      URL da imagem grande que aparece dentro da notificação (opcional)
                    </p>
                  </div>

                  <div>
                    <Label :for="`data-${index}`">Custom Data (JSON)</Label>
                    <Textarea
                      :id="`data-${index}`"
                      :model-value="typeof template.data === 'object' ? JSON.stringify(template.data, null, 2) : (template.data || '')"
                      @update:model-value="(val) => { template.data = val }"
                      placeholder='{"key": "value"}'
                      rows="3"
                    />
                    <p class="text-xs text-muted-foreground mt-1">
                      Dados customizados em formato JSON
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
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
                  @click="toggleDayOfWeek(index)"
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
              :disabled="!formData.name || formData.notificationTemplates.some(t => !t.title || !t.body)"
              @click="handleCreate"
            >
              Criar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Edit Dialog -->
    <Dialog v-model:open="showEditDialog">
      <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Automação</DialogTitle>
          <DialogDescription>
            Edite a configuração da automação de push notifications
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div>
            <Label for="edit-name">Nome *</Label>
            <Input id="edit-name" v-model="formData.name" placeholder="Ex: Boas-vindas" />
          </div>

          <div>
            <Label for="edit-description">Descrição</Label>
            <Textarea id="edit-description" v-model="formData.description" placeholder="Descrição da automação" />
          </div>

          <div>
            <Label for="edit-type">Tipo *</Label>
            <Select v-model="formData.type" disabled>
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
            <div class="flex justify-between items-center mb-4">
              <Label class="text-base font-semibold">Pushes da Automação *</Label>
              <Button type="button" variant="outline" size="sm" @click="addTemplate">
                <Icon name="lucide:plus" class="mr-2 size-4" />
                Adicionar Push
              </Button>
            </div>

            <div class="space-y-4">
              <Card
                v-for="(template, index) in formData.notificationTemplates"
                :key="index"
                class="relative"
              >
                <CardHeader class="pb-3">
                  <div class="flex justify-between items-center">
                    <CardTitle class="text-base">
                      Push #{{ index + 1 }}
                      <Badge v-if="index === 0" variant="secondary" class="ml-2">Primeiro (delay: 0)</Badge>
                      <Badge v-else variant="outline" class="ml-2">
                        Delay: {{ template.delayMinutes || 0 }}min
                      </Badge>
                    </CardTitle>
                    <div class="flex gap-2">
                      <Button
                        v-if="formData.notificationTemplates.length > 1"
                        variant="ghost"
                        size="sm"
                        @click="removeTemplate(index)"
                      >
                        <Icon name="lucide:trash" class="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        @click="toggleTemplateExpansion(index)"
                      >
                        <Icon
                          :name="expandedTemplates.has(index) ? 'lucide:chevron-up' : 'lucide:chevron-down'"
                          class="size-4"
                        />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent v-if="expandedTemplates.has(index)" class="space-y-4">
                  <div>
                    <Label :for="`edit-title-${index}`">Título *</Label>
                    <Input
                      :id="`edit-title-${index}`"
                      v-model="template.title"
                      placeholder="Título da notificação"
                    />
                  </div>

                  <div>
                    <Label :for="`edit-body-${index}`">Corpo *</Label>
                    <Textarea
                      :id="`edit-body-${index}`"
                      v-model="template.body"
                      placeholder="Corpo da notificação"
                      rows="3"
                    />
                  </div>

                  <div v-if="index > 0">
                    <Label :for="`edit-delay-${index}`">Delay após push anterior (minutos) *</Label>
                    <Input
                      :id="`edit-delay-${index}`"
                      v-model.number="template.delayMinutes"
                      type="number"
                      min="0"
                      placeholder="0"
                    />
                    <p class="text-xs text-muted-foreground mt-1">
                      Tempo de espera após o push anterior ser enviado
                    </p>
                  </div>

                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <Label :for="`edit-badge-${index}`">Badge Count</Label>
                      <Input
                        :id="`edit-badge-${index}`"
                        v-model.number="template.badge"
                        type="number"
                        min="0"
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <Label :for="`edit-sound-${index}`">Sound</Label>
                      <Input
                        :id="`edit-sound-${index}`"
                        v-model="template.sound"
                        placeholder="default"
                      />
                    </div>
                  </div>

                  <div>
                    <Label :for="`edit-clickAction-${index}`">Click Action (URL)</Label>
                    <Input
                      :id="`edit-clickAction-${index}`"
                      v-model="template.clickAction"
                      placeholder="https://example.com"
                    />
                  </div>

                  <div>
                    <Label :for="`edit-imageUrl-${index}`">Image URL</Label>
                    <Input
                      :id="`edit-imageUrl-${index}`"
                      v-model="template.imageUrl"
                      placeholder="https://example.com/image.png"
                    />
                  </div>

                  <div>
                    <Label :for="`edit-data-${index}`">Custom Data (JSON)</Label>
                    <Textarea
                      :id="`edit-data-${index}`"
                      v-model="template.data"
                      placeholder='{"key": "value"}'
                      rows="3"
                    />
                    <p class="text-xs text-muted-foreground mt-1">
                      Dados customizados em formato JSON
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div v-if="formData.type === 'RECURRING'" class="border-t pt-4 space-y-4">
            <div>
              <Label for="edit-frequency">Frequência *</Label>
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
              <Label for="edit-timeOfDay">Horário (HH:MM) *</Label>
              <Input id="edit-timeOfDay" v-model="formData.timeOfDay" placeholder="09:00" />
            </div>

            <div v-if="formData.frequency === 'WEEKLY'">
              <Label>Dias da Semana *</Label>
              <div class="flex flex-wrap gap-2 mt-2">
                <Button
                  v-for="(label, index) in daysOfWeekLabels"
                  :key="index"
                  :variant="formData.daysOfWeek.includes(index) ? 'default' : 'outline'"
                  size="sm"
                  @click="toggleDayOfWeek(index)"
                >
                  {{ label }}
                </Button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <Label for="edit-startDate">Data de Início</Label>
                <Input id="edit-startDate" v-model="formData.startDate" type="date" />
              </div>
              <div>
                <Label for="edit-endDate">Data de Fim</Label>
                <Input id="edit-endDate" v-model="formData.endDate" type="date" />
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-4">
            <Button variant="outline" @click="showEditDialog = false">
              Cancelar
            </Button>
            <Button
              :disabled="!formData.name || formData.notificationTemplates.some(t => !t.title || !t.body)"
              @click="handleUpdate"
            >
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

