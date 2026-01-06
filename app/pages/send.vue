<script setup lang="ts">
import { Badge } from 'abckit/shadcn/badge'
import { Button } from 'abckit/shadcn/button'
import { Card, CardContent, CardHeader, CardTitle } from 'abckit/shadcn/card'
import { Checkbox } from 'abckit/shadcn/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from 'abckit/shadcn/collapsible'
import { Input } from 'abckit/shadcn/input'
import { Label } from 'abckit/shadcn/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'abckit/shadcn/select'
import { Textarea } from 'abckit/shadcn/textarea'

definePageMeta({
  layout: 'default',
})

// API queries
const { data: appsData, isLoading: _appsLoading } = useApps()
const apps = computed(() => appsData.value || [])
const { mutateAsync: sendNotificationMutation, isLoading: isSendingNotification } = useSendNotification()
const { mutateAsync: scheduleNotificationMutation, isLoading: isSchedulingNotification } = useScheduleNotification()

// Reactive data
const form = ref({
  appId: '',
  title: '',
  body: '',
  badge: undefined as number | undefined,
  sound: '',
  clickAction: '',
  icon: '',
  image: '',
  data: null,
})

const customData = ref('')
const targetType = ref('all')
const selectedPlatforms = ref<string[]>([])
const deviceIds = ref('')
const scheduleType = ref('now')
const scheduledAt = ref('')

// Multiple schedule
const multipleScheduleEnabled = ref(false)
const selectedDays = ref<number[]>([])
const scheduleTimes = ref<Array<{ date: string; times: string[] }>>([])
const newTime = ref('')

const daysOfWeekLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Computed
const selectedApp = computed(() => {
  return apps.value?.find((app: any) => app.id === form.value.appId)
})

// Methods

function getTargetDescription() {
  if (targetType.value === 'all')
    return 'Todos os dispositivos'
  if (targetType.value === 'platform') {
    return selectedPlatforms.value.length > 0
      ? selectedPlatforms.value.join(', ')
      : 'Nenhuma plataforma selecionada'
  }
  if (targetType.value === 'devices') {
    const deviceCount = deviceIds.value.split('\n').filter(id => id.trim()).length
    return `${deviceCount} dispositivos específicos`
  }
  return 'Desconhecido'
}

function getTotalNotificationsCount() {
  if (!multipleScheduleEnabled.value || scheduleTimes.value.length === 0)
    return 1
  return scheduleTimes.value.reduce((sum, st) => sum + st.times.length, 0)
}

function addScheduleTime() {
  if (!newTime.value || !selectedDays.value.length)
    return

  const time = newTime.value.trim()
  if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time))
    return

  // Adicionar para cada dia selecionado - calcular próxima ocorrência de cada dia
  for (const day of selectedDays.value) {
    const today = new Date()
    const dayOfWeek = today.getDay()
    let daysUntil = day - dayOfWeek
    
    // Se o dia já passou esta semana, usar próxima semana
    if (daysUntil <= 0)
      daysUntil += 7
    
    const targetDate = new Date(today)
    targetDate.setDate(today.getDate() + daysUntil)
    const dateStr = targetDate.toISOString().split('T')[0]

    const existing = scheduleTimes.value.find(st => st.date === dateStr)
    if (existing) {
      if (!existing.times.includes(time))
        existing.times.push(time)
    }
    else {
      scheduleTimes.value.push({ date: dateStr, times: [time] })
    }
  }

  newTime.value = ''
  // Ordenar por data
  scheduleTimes.value.sort((a, b) => a.date.localeCompare(b.date))
}

function removeScheduleTime(date: string, time: string) {
  const schedule = scheduleTimes.value.find(st => st.date === date)
  if (schedule) {
    schedule.times = schedule.times.filter(t => t !== time)
    if (schedule.times.length === 0)
      scheduleTimes.value = scheduleTimes.value.filter(st => st.date !== date)
  }
}

function toggleDaySelection(dayIndex: number) {
  if (selectedDays.value.includes(dayIndex)) {
    selectedDays.value = selectedDays.value.filter(d => d !== dayIndex)
  }
  else {
    selectedDays.value.push(dayIndex)
  }
}

async function sendNotification() {
  if (!form.value.appId || !form.value.title || !form.value.body)
    return

  try {
    // Prepare payload
    const payload: any = {
      appId: form.value.appId,
      title: form.value.title,
      body: form.value.body,
      icon: form.value.icon || undefined,
      imageUrl: form.value.image || undefined,
      clickAction: form.value.clickAction || undefined,
      sound: form.value.sound || undefined,
      badge: form.value.badge || undefined,
      data: customData.value ? JSON.parse(customData.value) : undefined,
      targetDevices: targetType.value === 'devices'
        ? deviceIds.value.split('\n').filter(id => id.trim())
        : undefined,
      platforms: targetType.value === 'platform'
        ? selectedPlatforms.value
        : undefined,
    }

    // Agendamento múltiplo ou único
    if (multipleScheduleEnabled.value && scheduleTimes.value.length > 0) {
      payload.scheduleTimes = scheduleTimes.value
      await scheduleNotificationMutation(payload)
    }
    else if (scheduleType.value === 'later' && scheduledAt.value) {
      payload.scheduledAt = scheduledAt.value
      await scheduleNotificationMutation(payload)
    }
    else {
    await sendNotificationMutation(payload)
    }

    console.log('Notification sent successfully!')
    // TODO: Show success toast and redirect to notification details
    resetForm()
  }
  catch (error) {
    console.error('Error sending notification:', error)
    // TODO: Show error toast
  }
}

function resetForm() {
  form.value = {
    appId: '',
    title: '',
    body: '',
    badge: undefined,
    sound: '',
    clickAction: '',
    icon: '',
    image: '',
    data: null,
  }
  customData.value = ''
  targetType.value = 'all'
  selectedPlatforms.value = []
  deviceIds.value = ''
  scheduleType.value = 'now'
  scheduledAt.value = ''
  multipleScheduleEnabled.value = false
  selectedDays.value = []
  scheduleTimes.value = []
  newTime.value = ''
}

// Apps are automatically loaded by useApps() composable
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold mb-2">Enviar Notificação</h1>
      <p class="text-muted-foreground">Envie notificações push para seus dispositivos registrados</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Form -->
      <div class="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Detalhes da Notificação</CardTitle>
          </CardHeader>
          <CardContent>
            <form class="space-y-6" @submit.prevent="sendNotification">
              <!-- App Selection -->
              <div class="space-y-2">
                <Label for="app">Aplicativo *</Label>
                <Select v-model="form.appId" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um app" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="app in (apps || [])" :key="app.id" :value="app.id">
                      {{ app.name }} ({{ app.slug }})
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- Notification Content -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label for="title">Título *</Label>
                  <Input
                    id="title"
                    v-model="form.title"
                    placeholder="Título da notificação"
                    required
                  />
                </div>
                <div class="space-y-2">
                  <Label for="badge">Badge Count</Label>
                  <Input
                    id="badge"
                    v-model.number="form.badge"
                    type="number"
                    placeholder="1"
                  />
                </div>
              </div>

              <div class="space-y-2">
                <Label for="body">Mensagem *</Label>
                <Textarea
                  id="body"
                  v-model="form.body"
                  placeholder="Sua mensagem de notificação..."
                  required
                  rows="3"
                />
              </div>

              <!-- Advanced Options -->
              <Collapsible>
                <CollapsibleTrigger as-child>
                  <Button variant="ghost" class="w-full justify-between">
                    Opções Avançadas
                    <Icon name="lucide:chevron-down" class="size-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent class="space-y-4 pt-4">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <Label for="sound">Som</Label>
                      <Input
                        id="sound"
                        v-model="form.sound"
                        placeholder="default"
                      />
                    </div>
                    <div class="space-y-2">
                      <Label for="clickAction">Ação de Clique (URL)</Label>
                      <Input
                        id="clickAction"
                        v-model="form.clickAction"
                        placeholder="https://example.com"
                      />
                    </div>
                  </div>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="space-y-2">
                      <Label for="icon">Ícone (URL)</Label>
                      <Input
                        id="icon"
                        v-model="form.icon"
                        placeholder="https://example.com/icon.png"
                      />
                    </div>
                    <div class="space-y-2">
                      <Label for="image">Imagem (URL)</Label>
                      <Input
                        id="image"
                        v-model="form.image"
                        placeholder="https://example.com/image.png"
                      />
                    </div>
                  </div>

                  <div class="space-y-2">
                    <Label for="data">Dados Customizados (JSON)</Label>
                    <Textarea
                      id="data"
                      v-model="customData"
                      placeholder="{&quot;key&quot;: &quot;value&quot;}"
                      rows="3"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <!-- Target Selection -->
              <div class="space-y-4">
                <Label>Público Alvo</Label>
                <div class="space-y-3">
                  <div class="flex items-center space-x-2">
                    <Checkbox
                      id="all-devices"
                      :model-value="targetType === 'all'"
                      @update:model-value="targetType = 'all'"
                    />
                    <Label for="all-devices">Todos os dispositivos registrados</Label>
                  </div>

                  <div class="flex items-center space-x-2">
                    <Checkbox
                      id="platform-filter"
                      :model-value="targetType === 'platform'"
                      @update:model-value="targetType = 'platform'"
                    />
                    <Label for="platform-filter">Filtrar por plataforma</Label>
                  </div>

                  <div v-if="targetType === 'platform'" class="ml-6 space-y-2">
                    <div class="flex space-x-4">
                      <div class="flex items-center space-x-2">
                        <Checkbox id="ios" :model-value="selectedPlatforms.includes('ios')" @update:model-value="(checked: any) => checked ? selectedPlatforms.push('ios') : selectedPlatforms.splice(selectedPlatforms.indexOf('ios'), 1)" />
                        <Label for="ios">iOS</Label>
                      </div>
                      <div class="flex items-center space-x-2">
                        <Checkbox id="android" :model-value="selectedPlatforms.includes('android')" @update:model-value="(checked: any) => checked ? selectedPlatforms.push('android') : selectedPlatforms.splice(selectedPlatforms.indexOf('android'), 1)" />
                        <Label for="android">Android</Label>
                      </div>
                      <div class="flex items-center space-x-2">
                        <Checkbox id="web" :model-value="selectedPlatforms.includes('web')" @update:model-value="(checked: any) => checked ? selectedPlatforms.push('web') : selectedPlatforms.splice(selectedPlatforms.indexOf('web'), 1)" />
                        <Label for="web">Web</Label>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center space-x-2">
                    <Checkbox
                      id="specific-devices"
                      :model-value="targetType === 'devices'"
                      @update:model-value="targetType = 'devices'"
                    />
                    <Label for="specific-devices">Dispositivos específicos</Label>
                  </div>

                  <div v-if="targetType === 'devices'" class="ml-6">
                    <Textarea
                      v-model="deviceIds"
                      placeholder="Insira os IDs dos dispositivos, um por linha"
                      rows="3"
                    />
                  </div>
                </div>
              </div>

              <!-- Schedule -->
              <div class="space-y-4">
                <Label>Agendamento</Label>
                <div class="space-y-2">
                <div class="flex items-center space-x-2">
                  <Checkbox
                    id="send-now"
                      :model-value="scheduleType === 'now' && !multipleScheduleEnabled"
                      @update:model-value="scheduleType = 'now'; multipleScheduleEnabled = false"
                  />
                  <Label for="send-now">Enviar agora</Label>
                </div>
                <div class="flex items-center space-x-2">
                  <Checkbox
                    id="schedule-later"
                      :model-value="scheduleType === 'later' && !multipleScheduleEnabled"
                      @update:model-value="scheduleType = 'later'; multipleScheduleEnabled = false"
                  />
                    <Label for="schedule-later">Agendar para depois (único)</Label>
                </div>
                  <div v-if="scheduleType === 'later' && !multipleScheduleEnabled" class="ml-6">
                  <Input
                    v-model="scheduledAt"
                    type="datetime-local"
                    :min="new Date().toISOString().slice(0, 16)"
                  />
                  </div>
                  <div class="flex items-center space-x-2">
                    <Checkbox
                      id="multiple-schedule"
                      :model-value="multipleScheduleEnabled"
                      @update:model-value="multipleScheduleEnabled = $event; if ($event) scheduleType = 'later'"
                    />
                    <Label for="multiple-schedule">Agendamento múltiplo (dias + horários)</Label>
                  </div>
                </div>

                <!-- Multiple Schedule UI -->
                <div v-if="multipleScheduleEnabled" class="ml-6 space-y-4 border-l-2 pl-4">
                  <div>
                    <Label>Selecionar Dias da Semana</Label>
                    <div class="flex flex-wrap gap-2 mt-2">
                      <Button
                        v-for="(label, index) in daysOfWeekLabels"
                        :key="index"
                        :variant="selectedDays.includes(index) ? 'default' : 'outline'"
                        size="sm"
                        @click="toggleDaySelection(index)"
                      >
                        {{ label }}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label>Adicionar Horário</Label>
                    <div class="flex gap-2 mt-2">
                      <Input
                        v-model="newTime"
                        type="time"
                        placeholder="09:00"
                        class="flex-1"
                      />
                      <Button
                        type="button"
                        :disabled="!newTime || selectedDays.length === 0"
                        @click="addScheduleTime"
                      >
                        Adicionar
                      </Button>
                    </div>
                    <p class="text-xs text-muted-foreground mt-1">
                      Selecione os dias e adicione horários para cada dia
                    </p>
                  </div>

                  <div v-if="scheduleTimes.length > 0" class="space-y-2">
                    <Label>Horários Agendados ({{ getTotalNotificationsCount() }} notificações serão criadas)</Label>
                    <div class="space-y-2 max-h-48 overflow-y-auto">
                      <div
                        v-for="schedule in scheduleTimes"
                        :key="schedule.date"
                        class="p-2 border rounded"
                      >
                        <div class="font-medium mb-1">
                          {{ new Date(schedule.date).toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) }}
                        </div>
                        <div class="flex flex-wrap gap-2">
                          <Badge
                            v-for="time in schedule.times"
                            :key="time"
                            variant="secondary"
                            class="flex items-center gap-1"
                          >
                            {{ time }}
                            <Button
                              variant="ghost"
                              size="sm"
                              class="h-4 w-4 p-0"
                              @click="removeScheduleTime(schedule.date, time)"
                            >
                              <Icon name="lucide:x" class="h-3 w-3" />
                            </Button>
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Submit -->
              <div class="flex space-x-2">
                <Button
                  type="submit"
                  :disabled="!form.appId || !form.title || !form.body || isSendingNotification || isSchedulingNotification || (multipleScheduleEnabled && scheduleTimes.length === 0)"
                  class="flex-1"
                >
                  <Icon
                    v-if="isSendingNotification || isSchedulingNotification"
                    name="lucide:loader-2"
                    class="size-4 mr-2 animate-spin"
                  />
                  <Icon name="lucide:send" class="size-4 mr-2" />
                  {{
                    scheduleType === 'now'
                      ? 'Enviar Agora'
                      : multipleScheduleEnabled
                        ? `Agendar ${getTotalNotificationsCount()} Notificações`
                        : 'Agendar'
                  }}
                </Button>
                <Button type="button" variant="outline" @click="resetForm">
                  Limpar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <!-- Preview -->
      <div>
        <Card class="sticky top-4">
          <CardHeader>
            <CardTitle>Pré-visualização</CardTitle>
          </CardHeader>
          <CardContent>
            <!-- Mobile Preview -->
            <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 space-y-3">
              <div class="flex items-center space-x-2 text-xs text-muted-foreground">
                <Icon name="lucide:smartphone" class="h-3 w-3" />
                <span>Notificação Móvel</span>
              </div>

              <div class="bg-white dark:bg-gray-900 rounded-lg p-3 shadow-sm">
                <div class="flex items-start space-x-3">
                  <div class="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                    <span class="text-xs text-primary-foreground font-bold">
                      {{ selectedApp?.name?.charAt(0) || 'A' }}
                    </span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                      <p class="font-medium text-sm truncate">
                        {{ selectedApp?.name || 'Nome do App' }}
                      </p>
                      <span class="text-xs text-muted-foreground">agora</span>
                    </div>
                    <p class="font-semibold text-sm mb-1">
                      {{ form.title || 'Título da Notificação' }}
                    </p>
                    <p class="text-sm text-muted-foreground line-clamp-2">
                      {{ form.body || 'Sua mensagem de notificação aparecerá aqui...' }}
                    </p>
                  </div>
                  <div v-if="form.badge" class="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                    <span class="text-xs text-white font-bold">{{ form.badge }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Targeting Info -->
            <div class="mt-4 space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Alvo:</span>
                <span>{{ getTargetDescription() }}</span>
              </div>
              <div v-if="selectedApp" class="flex justify-between">
                <span class="text-muted-foreground">App:</span>
                <span>{{ selectedApp.name }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Agendamento:</span>
                <span>
                  {{
                    scheduleType === 'now'
                      ? 'Enviar imediatamente'
                      : multipleScheduleEnabled
                        ? `${getTotalNotificationsCount()} agendadas`
                        : 'Agendado'
                  }}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
