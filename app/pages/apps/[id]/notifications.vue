<script setup lang="ts">
import { Badge } from 'abckit/shadcn/badge'
import { Button } from 'abckit/shadcn/button'
import { Card, CardContent, CardHeader, CardTitle } from 'abckit/shadcn/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from 'abckit/shadcn/dialog'
import { Input } from 'abckit/shadcn/input'
import { Label } from 'abckit/shadcn/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'abckit/shadcn/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'abckit/shadcn/table'
import { Tabs, TabsList, TabsTrigger } from 'abckit/shadcn/tabs'
import { useNotificationApi } from '~/graphql/notifications'
import { useAutomations } from '~/graphql/automations'

definePageMeta({
  layout: 'default',
})

const route = useRoute()
const appId = computed(() => route.params.id as string)

// API queries
const { data: appData } = useApp(appId)
const app = computed(() => appData.value)

const selectedType = ref('manual')

const apiFilter = computed(() => {
  if (selectedType.value === 'manual')
    return { isAutomation: false }
  if (selectedType.value === 'automation')
    return { isAutomation: true }
  return undefined
})

const { data: notificationsData, isLoading: notificationsLoading } = useNotificationApi(appId, apiFilter as any)
const notifications = computed(() => notificationsData.value || [])

// Automation data (only fetch when automation tab is selected)
const { data: automationsData, isLoading: automationsLoading } = useAutomations(appId)

// Reactive data
const searchQuery = ref('')
const selectedStatus = ref('all')
const selectedTimeRange = ref('7d')
const showDetailsDialog = ref(false)
const selectedNotification = ref<any>(null)

// Filtered notifications
const filteredNotifications = computed(() => {
  let filtered = notifications.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(notification =>
      notification.title.toLowerCase().includes(query)
      || notification.body.toLowerCase().includes(query),
    )
  }

  if (selectedStatus.value !== 'all') {
    filtered = filtered.filter(notification => notification.status === selectedStatus.value)
  }

  // Filter out ALL automation notifications from manual tab (not just scheduled)
  if (selectedType.value === 'manual') {
    filtered = filtered.filter(notification => !notification.automationId)
  }

  return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
})

// Notification stats
const notificationStats = computed(() => {
  const stats = notifications.value.reduce((acc, notification) => {
    acc.total++
    acc.totalTargeted += Number(notification.totalTargets || 0)
    acc.totalDelivered += Number(notification.totalDelivered || 0)
    acc.totalFailed += Number(notification.totalFailed || 0)
    acc.totalClicked += Number(notification.totalClicked || 0)

    switch (notification.status) {
      case 'DELIVERED':
        acc.delivered++
        break
      case 'SENT':
        acc.sent++
        break
      case 'PENDING':
        acc.pending++
        break
      case 'SCHEDULED':
        acc.scheduled++
        break
      case 'FAILED':
        acc.failed++
        break
    }

    return acc
  }, {
    total: 0,
    delivered: 0,
    sent: 0,
    pending: 0,
    scheduled: 0,
    failed: 0,
    totalTargeted: 0,
    totalDelivered: 0,
    totalFailed: 0,
    totalClicked: 0,
    deliveryRate: 0,
    ctr: 0,
  })

  stats.deliveryRate = stats.totalTargeted > 0
    ? Math.round((stats.totalDelivered / stats.totalTargeted) * 100)
    : 0

  stats.ctr = stats.totalDelivered > 0
    ? Math.round((stats.totalClicked / stats.totalDelivered) * 100 * 10) / 10
    : 0

  return stats
})

function getStatusBadge(status: string) {
  switch (status) {
    case 'DELIVERED':
      return { variant: 'default' as const, iconName: 'lucide:check-circle', text: 'Entregue' }
    case 'SENT':
      return { variant: 'secondary' as const, iconName: 'lucide:send', text: 'Enviado' }
    case 'PENDING':
      return { variant: 'outline' as const, iconName: 'lucide:loader-2', text: 'Pendente' }
    case 'SCHEDULED':
      return { variant: 'outline' as const, iconName: 'lucide:calendar', text: 'Agendado' }
    case 'FAILED':
      return { variant: 'destructive' as const, iconName: 'lucide:x-circle', text: 'Falha' }
    default:
      return { variant: 'secondary' as const, iconName: 'lucide:send', text: 'Desconhecido' }
  }
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString)
    return 'Não enviado'
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString))
}

function formatTimeAgo(dateString: string) {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1)
    return 'Agora mesmo'
  if (diffMinutes < 60)
    return `${diffMinutes}m atrás`
  if (diffHours < 24)
    return `${diffHours}h atrás`
  return `${diffDays}d atrás`
}

function getDeliveryRate(notification: any) {
  if (notification.totalTargets === 0)
    return 0
  return Math.round((notification.totalDelivered / notification.totalTargets) * 100)
}

function getCtr(notification: any) {
  if (notification.totalDelivered === 0)
    return 0
  return Math.round((notification.totalClicked / notification.totalDelivered) * 100 * 10) / 10
}

function viewNotificationDetails(notificationId: string) {
  const notification = notifications.value.find(n => n.id === notificationId)
  if (notification) {
    selectedNotification.value = notification
    showDetailsDialog.value = true
  }
}

function refreshNotifications() {
  // Trigger refetch of notifications
  notificationsData.value = undefined
}
</script>

<template>
  <div v-if="app">
    <!-- App Header -->
    <AppDetailHeader :app="app" />

    <!-- Navigation -->
    <AppNavigation :app-id="appId" />

    <!-- Notifications Content -->
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold mb-2">Histórico de Notificações</h2>
          <p class="text-muted-foreground">Visualize e gerencie suas notificações enviadas e o status de entrega.</p>
        </div>
        <div class="flex space-x-2">
          <Button variant="outline" :disabled="notificationsLoading" @click="refreshNotifications">
            <Icon name="lucide:send" class="mr-2 size-4" :class="{ 'animate-pulse': notificationsLoading }" />
            Atualizar
          </Button>
          <Button @click="navigateTo('/send')">
            <Icon name="lucide:send" class="mr-2 size-4" />
            Enviar Nova
          </Button>
        </div>
      </div>

      <!-- Report Type Tabs -->
      <Tabs v-model="selectedType" class="w-full">
        <TabsList>
          <TabsTrigger value="manual">
            Manual (Avulso)
          </TabsTrigger>
          <TabsTrigger value="automation">
            Automação
          </TabsTrigger>
          <TabsTrigger value="all">
            Todas
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Total Enviado</CardTitle>
            <Icon name="lucide:send" class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ notificationStats.total }}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Entregue</CardTitle>
            <Icon name="lucide:check-circle" class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold text-green-600">{{ notificationStats.totalDelivered }}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Falha</CardTitle>
            <Icon name="lucide:x-circle" class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold text-red-600">{{ notificationStats.totalFailed }}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Taxa de Entrega</CardTitle>
            <Icon name="lucide:calendar" class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ notificationStats.deliveryRate }}%</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Cliques / CTR</CardTitle>
            <Icon name="lucide:mouse-pointer-2" class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="flex items-baseline space-x-2">
              <span class="text-2xl font-bold">{{ notificationStats.totalClicked }}</span>
              <span class="text-sm text-muted-foreground">({{ notificationStats.ctr }}%)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Filters -->
      <Card>
        <CardContent class="pt-6">
          <div class="flex flex-col sm:flex-row gap-4">
            <div class="flex-1">
              <div class="relative">
                <Icon name="lucide:search" class="absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  v-model="searchQuery"
                  placeholder="Buscar notificações por título ou conteúdo..."
                  class="pl-10"
                />
              </div>
            </div>
            <Select v-model="selectedStatus">
              <SelectTrigger class="w-full sm:w-40">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="DELIVERED">Entregue</SelectItem>
                <SelectItem value="SENT">Enviado</SelectItem>
                <SelectItem value="PENDING">Pendente</SelectItem>
                <SelectItem value="SCHEDULED">Agendado</SelectItem>
                <SelectItem value="FAILED">Falha</SelectItem>
              </SelectContent>
            </Select>
            <Select v-model="selectedTimeRange">
              <SelectTrigger class="w-full sm:w-32">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Últimas 24h</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="all">Todo o período</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <!-- Automations List (when automation tab is selected) -->
      <Card v-if="selectedType === 'automation'">
        <CardHeader>
          <CardTitle>Automações ({{ automationsData?.length || 0 }})</CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="automationsLoading" class="flex items-center justify-center py-8">
            <Icon name="lucide:loader-2" class="h-6 w-6 animate-spin" />
          </div>

          <div v-else-if="!automationsData || automationsData.length === 0" class="text-center py-8 text-muted-foreground">
            <Icon name="lucide:zap" class="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p class="text-lg font-medium mb-2">Nenhuma automação encontrada</p>
            <p class="text-sm">Crie sua primeira automação para começar.</p>
          </div>

          <Table v-else>
            <TableHeader>
              <TableRow>
                <TableHead>Automação</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Enviados</TableHead>
                <TableHead>Entregues</TableHead>
                <TableHead>Cliques</TableHead>
                <TableHead>Criado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="automation in automationsData" :key="automation.id">
                <TableCell>
                  <div class="space-y-1">
                    <p class="font-medium">{{ automation.name }}</p>
                    <p v-if="automation.description" class="text-sm text-muted-foreground line-clamp-2">{{ automation.description }}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge :variant="automation.isActive ? 'default' : 'secondary'">
                    <Icon :name="automation.isActive ? 'lucide:check-circle' : 'lucide:pause-circle'" class="mr-1 h-3 w-3" />
                    {{ automation.isActive ? 'Ativo' : 'Inativo' }}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span class="text-sm">{{ automation.type === 'SUBSCRIPTION' ? 'Inscrição' : 'Recorrente' }}</span>
                </TableCell>
                <TableCell>
                  <span class="text-sm font-medium">{{ automation.stats?.sent || 0 }}</span>
                </TableCell>
                <TableCell>
                  <div class="space-y-1">
                    <div class="flex items-center space-x-2">
                      <span class="text-sm font-medium">{{ automation.stats?.deliveryRate || 0 }}%</span>
                      <span class="text-xs text-muted-foreground">({{ automation.stats?.delivered || 0 }})</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="space-y-1">
                    <div class="flex items-center space-x-2">
                      <span class="text-sm font-medium">{{ automation.stats?.ctr || 0 }}%</span>
                      <span class="text-xs text-muted-foreground">({{ automation.stats?.clicks || 0 }})</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span class="text-sm text-muted-foreground">{{ formatTimeAgo(automation.createdAt) }}</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Notifications Table (when manual or all tab is selected) -->
      <Card v-else>
        <CardHeader>
          <CardTitle>Notificações ({{ filteredNotifications.length }})</CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="notificationsLoading" class="flex items-center justify-center py-8">
            <Icon name="lucide:loader-2" class="h-6 w-6 animate-spin" />
          </div>

          <div v-else-if="filteredNotifications.length === 0" class="text-center py-8 text-muted-foreground">
            <Icon name="lucide:send" class="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p class="text-lg font-medium mb-2">Nenhuma notificação encontrada</p>
            <p class="text-sm">{{ notifications.length === 0 ? 'Envie sua primeira notificação para começar.' : 'Tente ajustar seus filtros de busca.' }}</p>
          </div>

          <div class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-[280px]">Notificação</TableHead>
                  <TableHead class="w-[110px]">Status</TableHead>
                  <TableHead class="w-[100px] text-center">Entrega</TableHead>
                  <TableHead class="w-[90px] text-center">Cliques</TableHead>
                  <TableHead class="w-[160px]">Enviado</TableHead>
                  <TableHead class="w-[80px] text-center">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="notification in filteredNotifications" :key="notification.id" class="hover:bg-muted/50">
                  <TableCell class="max-w-[280px]">
                    <div class="space-y-1">
                      <p class="font-medium text-sm leading-tight">{{ notification.title }}</p>
                      <p class="text-xs text-muted-foreground line-clamp-1">{{ notification.body }}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge :variant="getStatusBadge(notification.status).variant" class="text-xs whitespace-nowrap">
                      <Icon :name="getStatusBadge(notification.status).iconName" class="mr-1 h-3 w-3" />
                      {{ getStatusBadge(notification.status).text }}
                    </Badge>
                  </TableCell>
                  <TableCell class="text-center">
                    <div class="inline-flex flex-col items-end space-y-1">
                      <div class="text-base font-bold">{{ getDeliveryRate(notification) }}%</div>
                      <div class="text-xs text-muted-foreground whitespace-nowrap">
                        {{ notification.totalDelivered }}/{{ notification.totalTargets }}
                      </div>
                      <div v-if="notification.totalFailed > 0" class="text-xs text-red-600 font-medium whitespace-nowrap">
                        {{ notification.totalFailed }} falhas
                      </div>
                    </div>
                  </TableCell>
                  <TableCell class="text-center">
                    <div class="inline-flex flex-col items-end space-y-1">
                      <div class="text-base font-bold">{{ notification.totalClicked }}</div>
                      <div class="text-xs text-muted-foreground whitespace-nowrap">{{ getCtr(notification) }}% CTR</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div class="space-y-1">
                      <div class="text-sm font-medium">{{ formatDate(notification.sentAt) }}</div>
                      <div class="text-xs text-muted-foreground">{{ formatTimeAgo(notification.createdAt) }}</div>
                    </div>
                  </TableCell>
                  <TableCell class="text-center">
                    <Button variant="ghost" size="sm" @click="viewNotificationDetails(notification.id)">
                      <Icon name="lucide:eye" class="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>

  <!-- Loading State -->
  <div v-else class="flex items-center justify-center h-64">
    <Icon name="lucide:loader-2" class="h-8 w-8 animate-spin" />
  </div>

  <!-- Notification Details Dialog -->
  <Dialog v-model:open="showDetailsDialog">
    <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Detalhes da Notificação</DialogTitle>
        <DialogDescription>
          Informações completas sobre esta notificação
        </DialogDescription>
      </DialogHeader>
      
      <div v-if="selectedNotification" class="space-y-4">
        <!-- Status Badge -->
        <div>
          <Label class="text-sm font-medium">Status</Label>
          <div class="mt-1">
            <Badge :variant="getStatusBadge(selectedNotification.status).variant">
              <Icon :name="getStatusBadge(selectedNotification.status).iconName" class="mr-1 h-3 w-3" />
              {{ getStatusBadge(selectedNotification.status).text }}
            </Badge>
          </div>
        </div>

        <!-- Title and Body -->
        <div>
          <Label class="text-sm font-medium">Título</Label>
          <p class="mt-1 text-sm">{{ selectedNotification.title }}</p>
        </div>

        <div>
          <Label class="text-sm font-medium">Corpo</Label>
          <p class="mt-1 text-sm text-muted-foreground">{{ selectedNotification.body }}</p>
        </div>

        <!-- Scheduling -->
        <div v-if="selectedNotification.status === 'SCHEDULED' && selectedNotification.scheduledAt">
          <Label class="text-sm font-medium">Agendado para</Label>
          <p class="mt-1 text-sm">{{ formatDate(selectedNotification.scheduledAt) }}</p>
        </div>

        <!-- Delivery Stats -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label class="text-sm font-medium">Total de Alvos</Label>
            <p class="mt-1 text-lg font-semibold">{{ selectedNotification.totalTargets || 0 }}</p>
          </div>
          <div>
            <Label class="text-sm font-medium">Entregue</Label>
            <p class="mt-1 text-lg font-semibold text-green-600">{{ selectedNotification.totalDelivered || 0 }}</p>
          </div>
          <div>
            <Label class="text-sm font-medium">Falha</Label>
            <p class="mt-1 text-lg font-semibold text-red-600">{{ selectedNotification.totalFailed || 0 }}</p>
          </div>
          <div>
            <Label class="text-sm font-medium">Taxa de Entrega</Label>
            <p class="mt-1 text-lg font-semibold">{{ getDeliveryRate(selectedNotification) }}%</p>
          </div>
          <div>
            <Label class="text-sm font-medium">Cliques (CTR)</Label>
            <p class="mt-1 text-lg font-semibold">{{ selectedNotification.totalClicked || 0 }} <span class="text-sm font-normal text-muted-foreground">({{ getCtr(selectedNotification) }}%)</span></p>
          </div>
        </div>

        <!-- Timestamps -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <Label class="text-sm font-medium">Criado em</Label>
            <p class="mt-1 text-sm text-muted-foreground">{{ formatDate(selectedNotification.createdAt) }}</p>
          </div>
          <div v-if="selectedNotification.sentAt">
            <Label class="text-sm font-medium">Enviado em</Label>
            <p class="mt-1 text-sm text-muted-foreground">{{ formatDate(selectedNotification.sentAt) }}</p>
          </div>
        </div>

        <!-- Additional Data -->
        <div v-if="selectedNotification.icon || selectedNotification.imageUrl">
          <Label class="text-sm font-medium">Mídia</Label>
          <div class="mt-2 space-y-2">
            <div v-if="selectedNotification.icon" class="flex items-center space-x-2">
              <Label class="text-xs text-muted-foreground">Ícone:</Label>
              <a :href="selectedNotification.icon" target="_blank" class="text-xs text-blue-600 hover:underline truncate max-w-md">
                {{ selectedNotification.icon }}
              </a>
            </div>
            <div v-if="selectedNotification.imageUrl" class="flex items-center space-x-2">
              <Label class="text-xs text-muted-foreground">Imagem:</Label>
              <a :href="selectedNotification.imageUrl" target="_blank" class="text-xs text-blue-600 hover:underline truncate max-w-md">
                {{ selectedNotification.imageUrl }}
              </a>
            </div>
          </div>
        </div>

        <!-- Notification ID -->
        <div class="pt-4 border-t">
          <Label class="text-xs text-muted-foreground">ID da Notificação</Label>
          <p class="mt-1 text-xs font-mono text-muted-foreground break-all">{{ selectedNotification.id }}</p>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
