<script setup lang="ts">
import type { DevicePlatform } from '#graphql/client'
import { useQueryCache } from '@pinia/colada'
import { Alert, AlertDescription, AlertTitle } from 'abckit/shadcn/alert'
import { Badge } from 'abckit/shadcn/badge'
import { Button } from 'abckit/shadcn/button'
import { Card, CardContent, CardHeader, CardTitle } from 'abckit/shadcn/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from 'abckit/shadcn/dialog'
import { Input } from 'abckit/shadcn/input'
import { Label } from 'abckit/shadcn/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from 'abckit/shadcn/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'abckit/shadcn/table'

definePageMeta({
  layout: 'default',
})

const route = useRoute()
const appId = computed(() => route.params.id as string)

// API queries
const { data: appData } = useApp(appId)
const app = computed(() => appData.value)

const { data: devicesData, isLoading: devicesLoading } = useDevices(appId)
const devices = computed(() => devicesData.value || [])

const { mutateAsync: registerDeviceMutation, isLoading: isRegisteringDevice } = useRegisterDevice()
const { mutateAsync: deleteDeviceMutation, isLoading: isDeletingDevice } = useDeleteDevice()
const queryCache = useQueryCache()

// Reactive data
const searchQuery = ref('')
const selectedPlatform = ref('all')
const showRegisterDevice = ref(false)
const showDeleteDialog = ref(false)
const deviceToDelete = ref<string | null>(null)
const deviceForm = ref({
  token: '',
  platform: 'WEB',
  userId: '',
})

// Filtered devices
const filteredDevices = computed(() => {
  let filtered = devices.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(device =>
      device.token.toLowerCase().includes(query)
      || device.platform.toLowerCase().includes(query)
      || device.userId?.toLowerCase().includes(query),
    )
  }

  if (selectedPlatform.value !== 'all') {
    if (selectedPlatform.value === 'WEB') {
      // All web platforms
      filtered = filtered.filter(device => device.platform === 'WEB')
    }
    else if (['CHROME', 'FIREFOX', 'SAFARI', 'EDGE', 'OPERA'].includes(selectedPlatform.value)) {
      // Filter by browser category
      filtered = filtered.filter(device => device.category === selectedPlatform.value)
    }
    else {
      // Direct platform filtering (IOS, ANDROID)
      filtered = filtered.filter(device => device.platform === selectedPlatform.value)
    }
  }

  // Sort by platform type, then by creation date
  return filtered.sort((a, b) => {
    // Group by platform type
    const platformOrder = { IOS: 1, ANDROID: 2, WEB: 3 }
    const aOrder = platformOrder[a.platform as keyof typeof platformOrder] || 4
    const bOrder = platformOrder[b.platform as keyof typeof platformOrder] || 4

    if (aOrder !== bOrder) {
      return aOrder - bOrder
    }

    // Within same platform group, sort by creation date (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
})

// Device stats
const deviceStats = computed(() => {
  const stats = devices.value.reduce((acc, device) => {
    acc.total++
    if (device.status === 'ACTIVE')
      acc.active++
    if (device.lastSeenAt && new Date(device.lastSeenAt) > new Date(Date.now() - 24 * 60 * 60 * 1000)) {
      acc.seenToday++
    }

    // Platform breakdown
    if (device.platform === 'IOS') {
      acc.ios++
    }
    else if (device.platform === 'ANDROID') {
      acc.android++
    }
    else if (device.platform === 'WEB') {
      acc.web++

      // Browser breakdown using category field
      if (device.category) {
        switch (device.category.toUpperCase()) {
          case 'CHROME':
            acc.chrome++
            break
          case 'FIREFOX':
            acc.firefox++
            break
          case 'SAFARI':
            acc.safari++
            break
          case 'EDGE':
            acc.edge++
            break
          case 'OPERA':
            acc.opera++
            break
          default:
            acc.unknownWeb++
        }
      }
      else {
        // Legacy: no category, try metadata
        try {
          const data = JSON.parse(device.metadata || '{}')
          const browser = data.browser?.toLowerCase()
          if (browser === 'chrome')
            acc.chrome++
          else if (browser === 'firefox')
            acc.firefox++
          else if (browser === 'safari')
            acc.safari++
          else if (browser === 'edge')
            acc.edge++
          else if (browser === 'opera')
            acc.opera++
          else acc.unknownWeb++
        }
        catch {
          acc.unknownWeb++
        }
      }
    }

    return acc
  }, {
    total: 0,
    active: 0,
    seenToday: 0,
    ios: 0,
    android: 0,
    web: 0,
    chrome: 0,
    firefox: 0,
    safari: 0,
    edge: 0,
    opera: 0,
    unknownWeb: 0,
  })

  return stats
})

// 7-day registration chart data
const registrationChartData = computed(() => {
  const last7Days = []
  const today = new Date()
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    date.setHours(0, 0, 0, 0)
    
    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() + 1)
    
    const count = devices.value.filter(device => {
      const deviceDate = new Date(device.createdAt)
      return deviceDate >= date && deviceDate < nextDate
    }).length
    
    last7Days.push({
      date: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      count,
      fullDate: date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
    })
  }
  
  const maxCount = Math.max(...last7Days.map(d => d.count), 1)
  return { days: last7Days, maxCount }
})

function formatLastSeen(date: string | null | undefined) {
  if (!date)
    return 'Nunca'
  const now = new Date()
  const lastSeen = new Date(date)
  const diffMs = now.getTime() - lastSeen.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor(diffMs / (1000 * 60))

  if (diffMinutes < 1)
    return 'Agora mesmo'
  if (diffMinutes < 60)
    return `há ${diffMinutes}m`
  if (diffHours < 24)
    return `há ${diffHours}h`
  if (diffDays === 1)
    return 'Ontem'
  return `há ${diffDays}d`
}

function getPlatformIcon(category: string | null, platform: string, metadata?: string) {
  // Use category first if available
  if (category) {
    switch (category.toUpperCase()) {
      case 'CHROME': return '🌐'
      case 'FIREFOX': return '🦊'
      case 'SAFARI': return '🧭'
      case 'EDGE': return '🌊'
      case 'OPERA': return '🎭'
      default: return '🌐'
    }
  }

  // Fallback to platform
  switch (platform.toUpperCase()) {
    case 'IOS': return '🍎'
    case 'ANDROID': return '🤖'
    case 'WEB': {
      // For web without category, try to parse from metadata (legacy)
      if (metadata) {
        try {
          const data = JSON.parse(metadata)
          const browser = data.browser?.toLowerCase()
          switch (browser) {
            case 'chrome': return '🌐'
            case 'firefox': return '🦊'
            case 'safari': return '🧭'
            case 'edge': return '🌊'
            case 'opera': return '🎭'
            default: return '🌐'
          }
        }
        catch {
          return '🌐'
        }
      }
      return '🌐'
    }
    default: return '📱'
  }
}

function getPlatformDescription(platform: string, metadata?: string): string {
  switch (platform.toUpperCase()) {
    case 'IOS':
      return 'Apple Push Notification service'
    case 'ANDROID':
      return 'Firebase Cloud Messaging'
    case 'WEB': {
      if (metadata) {
        try {
          const data = JSON.parse(metadata)
          const browser = data.browser?.toLowerCase()
          switch (browser) {
            case 'chrome':
              return 'Chrome Web Push'
            case 'firefox':
              return 'Mozilla Push Service'
            case 'safari':
              return 'Safari Web Push'
            case 'edge':
              return 'Microsoft Edge Web Push'
            case 'opera':
              return 'Opera Web Push'
            default:
              return 'Web Push API'
          }
        }
        catch {
          return 'Web Push API'
        }
      }
      return 'Web Push API'
    }
    default:
      return 'Plataforma desconhecida'
  }
}

function getTokenType(platform: string): string {
  switch (platform.toUpperCase()) {
    case 'IOS':
      return 'APNs Device Token'
    case 'ANDROID':
      return 'FCM Registration Token'
    case 'WEB':
      return 'Web Push Endpoint'
    default:
      return 'Push Token'
  }
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function getOSInfo(metadata?: string): string | null {
  if (!metadata)
    return null

  try {
    const data = JSON.parse(metadata)
    const os = data.os

    if (os) {
      switch (os.toLowerCase()) {
        case 'mac':
        case 'macos':
          return 'macOS'
        case 'windows':
        case 'win':
          return 'Windows'
        case 'linux':
          return 'Linux'
        case 'android':
          return 'Android'
        case 'ios':
          return 'iOS'
        default:
          return os.charAt(0).toUpperCase() + os.slice(1)
      }
    }

    return null
  }
  catch {
    return null
  }
}

function getBasePlatformName(platform: string): string {
  switch (platform.toUpperCase()) {
    case 'IOS':
      return 'iOS'
    case 'ANDROID':
      return 'Android'
    case 'WEB':
      return 'Web'
    default:
      return 'Desconhecido'
  }
}

function getBrowserVersion(metadata?: string): string | null {
  if (!metadata)
    return null

  try {
    const data = JSON.parse(metadata)
    const version = data.browserVersion
    return version ? `v${version.split('.')[0]}` : null
  }
  catch {
    return null
  }
}

function getBrowserDisplayName(category: string | null, platform: string, metadata?: string): string {
  // For web platforms, show browser type
  if (platform === 'WEB') {
    if (category) {
      // Use category for browser name
      switch (category.toUpperCase()) {
        case 'CHROME':
          return 'Chrome'
        case 'FIREFOX':
          return 'Firefox'
        case 'SAFARI':
          return 'Safari'
        case 'EDGE':
          return 'Edge'
        case 'OPERA':
          return 'Opera'
        default:
          return category
      }
    }
    else {
      // Fallback: try to get from metadata
      if (metadata) {
        try {
          const data = JSON.parse(metadata)
          if (data.browser) {
            return data.browser.charAt(0).toUpperCase() + data.browser.slice(1)
          }
        }
        catch {
          // ignore
        }
      }
      return 'Navegador Web'
    }
  }

  // For non-web platforms, show OS/Platform name
  switch (platform.toUpperCase()) {
    case 'IOS':
      return 'iOS'
    case 'ANDROID':
      return 'Android'
    default:
      return platform || 'Desconhecido'
  }
}

async function registerDevice() {
  try {
    await registerDeviceMutation({
      appId: appId.value,
      token: deviceForm.value.token,
      platform: deviceForm.value.platform as DevicePlatform,
      userId: deviceForm.value.userId || undefined,
    })

    showRegisterDevice.value = false
    deviceForm.value = { token: '', platform: 'WEB', userId: '' }
  }
  catch (error) {
    console.error('Error registering device:', error)
  }
}

function deleteDevice(deviceId: string) {
  deviceToDelete.value = deviceId
  showDeleteDialog.value = true
}

async function confirmDeleteDevice() {
  if (!deviceToDelete.value)
    return

  try {
    await deleteDeviceMutation(deviceToDelete.value)
    // Invalidate devices query to refresh the list
    queryCache.invalidateQueries({ key: ['devices', appId.value] })
    showDeleteDialog.value = false
    deviceToDelete.value = null
  }
  catch (error) {
    console.error('Error deleting device:', error)
  }
}

function refreshDevices() {
  // Refresh devices list by invalidating the query
  queryCache.invalidateQueries({ key: ['devices', appId.value] })
}
</script>

<template>
  <div v-if="app">
    <!-- App Header -->
    <AppDetailHeader :app="app" />

    <!-- Navigation -->
    <AppNavigation :app-id="appId" />

    <!-- Devices Content -->
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-2xl font-bold mb-2">Dispositivos Registrados</h2>
          <p class="text-muted-foreground">Gerencie os dispositivos que podem receber notificações push.</p>
        </div>
        <div class="flex space-x-2">
          <Button variant="outline" :disabled="devicesLoading" @click="refreshDevices">
            <Icon name="lucide:refresh-cw" class="mr-2 size-4" :class="{ 'animate-spin': devicesLoading }" />
            Atualizar
          </Button>
          <Button @click="showRegisterDevice = true">
            <Icon name="lucide:plus" class="mr-2 size-4" />
            Registrar Dispositivo
          </Button>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Total de Dispositivos</CardTitle>
            <Icon name="lucide:smartphone" class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ deviceStats.total }}</div>
            <div class="text-xs text-muted-foreground mt-1">
              🍎{{ deviceStats.ios }} 🤖{{ deviceStats.android }} 🌐{{ deviceStats.web }}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Dispositivos Ativos</CardTitle>
            <Icon name="lucide:check-circle" class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ deviceStats.active }}</div>
            <div class="text-xs text-muted-foreground mt-1">
              Taxa de atividade: {{ Math.round((deviceStats.active / deviceStats.total) * 100) || 0 }}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Vistos Hoje</CardTitle>
            <Icon name="lucide:refresh-cw" class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ deviceStats.seenToday }}</div>
            <div class="text-xs text-muted-foreground mt-1">
              Nas últimas 24 horas
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Mix de Plataformas</CardTitle>
            <Icon name="lucide:smartphone" class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="space-y-1">
              <div class="flex justify-between text-sm">
                <span class="flex items-center"><span class="mr-1">🍎</span>iOS</span>
                <span class="font-medium">{{ deviceStats.ios }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="flex items-center"><span class="mr-1">🤖</span>Android</span>
                <span class="font-medium">{{ deviceStats.android }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="flex items-center"><span class="mr-1">🌐</span>Total Web</span>
                <span class="font-medium">{{ deviceStats.web }}</span>
              </div>
              <!-- Browser breakdown -->
              <div v-if="deviceStats.chrome > 0" class="flex justify-between text-xs text-muted-foreground pl-4">
                <span class="flex items-center"><span class="mr-1">🌐</span>Chrome</span>
                <span>{{ deviceStats.chrome }}</span>
              </div>
              <div v-if="deviceStats.firefox > 0" class="flex justify-between text-xs text-muted-foreground pl-4">
                <span class="flex items-center"><span class="mr-1">🦊</span>Firefox</span>
                <span>{{ deviceStats.firefox }}</span>
              </div>
              <div v-if="deviceStats.safari > 0" class="flex justify-between text-xs text-muted-foreground pl-4">
                <span class="flex items-center"><span class="mr-1">🧭</span>Safari</span>
                <span>{{ deviceStats.safari }}</span>
              </div>
              <div v-if="deviceStats.edge > 0" class="flex justify-between text-xs text-muted-foreground pl-4">
                <span class="flex items-center"><span class="mr-1">🌊</span>Edge</span>
                <span>{{ deviceStats.edge }}</span>
              </div>
              <div v-if="deviceStats.opera > 0" class="flex justify-between text-xs text-muted-foreground pl-4">
                <span class="flex items-center"><span class="mr-1">🎭</span>Opera</span>
                <span>{{ deviceStats.opera }}</span>
              </div>
              <div v-if="deviceStats.unknownWeb > 0" class="flex justify-between text-xs text-muted-foreground pl-4">
                <span class="flex items-center"><span class="mr-1">❓</span>Outros</span>
                <span>{{ deviceStats.unknownWeb }}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- 7-Day Registration Chart -->
      <Card class="overflow-hidden">
        <CardHeader class="pb-2">
          <CardTitle class="text-lg font-semibold tracking-tight">Registros de Dispositivos (7 Dias)</CardTitle>
          <CardDescription>Visualização da atividade de registro na última semana</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="h-[240px] w-full mt-4">
            <div class="relative h-full w-full">
              <!-- Grid Background -->
              <div class="absolute inset-0 flex flex-col justify-between pointer-events-none pb-8 pt-2 px-2">
                <div v-for="i in 5" :key="i" class="border-t border-muted/30 w-full h-0"></div>
              </div>

              <!-- SVG Area Chart -->
              <svg class="absolute inset-0 w-full h-full pb-8 pt-2 px-2 overflow-visible" viewBox="0 0 700 200" preserveAspectRatio="none">
                <!-- Gradient Definitions -->
                <defs>
                  <linearGradient id="sophisticatedAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:rgb(79, 70, 229);stop-opacity:0.35" />
                    <stop offset="60%" style="stop-color:rgb(147, 51, 234);stop-opacity:0.15" />
                    <stop offset="100%" style="stop-color:rgb(236, 72, 153);stop-opacity:0" />
                  </linearGradient>
                  <linearGradient id="sophisticatedLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:rgb(79, 70, 229);stop-opacity:1" />
                    <stop offset="50%" style="stop-color:rgb(147, 51, 234);stop-opacity:1" />
                    <stop offset="100%" style="stop-color:rgb(236, 72, 153);stop-opacity:1" />
                  </linearGradient>
                </defs>
                
                <!-- Area Path with Smoothing -->
                <path
                  :d="(() => {
                    if (registrationChartData.days.length < 2) return ''
                    const width = 700
                    const height = 200
                    const stepX = width / (registrationChartData.days.length - 1)
                    
                    const points = registrationChartData.days.map((day, i) => ({
                      x: i * stepX,
                      y: height - ((day.count / (registrationChartData.maxCount || 1)) * height)
                    }))
                    
                    let d = `M ${points[0].x} ${points[0].y}`
                    
                    for (let i = 0; i < points.length - 1; i++) {
                      const p0 = points[i]
                      const p1 = points[i + 1]
                      const cp1x = p0.x + (p1.x - p0.x) / 3
                      const cp2x = p0.x + 2 * (p1.x - p0.x) / 3
                      d += ` C ${cp1x} ${p0.y}, ${cp2x} ${p1.y}, ${p1.x} ${p1.y}`
                    }
                    
                    const last = points[points.length - 1]
                    d += ` L ${last.x} ${height} L ${points[0].x} ${height} Z`
                    return d
                  })()"
                  fill="url(#sophisticatedAreaGradient)"
                  class="transition-all duration-700 ease-in-out"
                />
                
                <!-- Line Path with Smoothing -->
                <path
                  :d="(() => {
                    if (registrationChartData.days.length < 2) return ''
                    const width = 700
                    const height = 200
                    const stepX = width / (registrationChartData.days.length - 1)
                    
                    const points = registrationChartData.days.map((day, i) => ({
                      x: i * stepX,
                      y: height - ((day.count / (registrationChartData.maxCount || 1)) * height)
                    }))
                    
                    let d = `M ${points[0].x} ${points[0].y}`
                    
                    for (let i = 0; i < points.length - 1; i++) {
                      const p0 = points[i]
                      const p1 = points[i + 1]
                      const cp1x = p0.x + (p1.x - p0.x) / 3
                      const cp2x = p0.x + 2 * (p1.x - p0.x) / 3
                      d += ` C ${cp1x} ${p0.y}, ${cp2x} ${p1.y}, ${p1.x} ${p1.y}`
                    }
                    
                    return d
                  })()"
                  fill="none"
                  stroke="url(#sophisticatedLineGradient)"
                  stroke-width="3.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  class="transition-all duration-700 ease-in-out"
                />
              </svg>
              
              <!-- Labels -->
              <div class="absolute bottom-0 left-0 right-0 flex justify-between px-2 pt-2">
                <div v-for="day in registrationChartData.days" :key="day.date" class="flex-1 flex flex-col items-center">
                  <div class="h-1 w-px bg-muted-foreground/30 mb-1"></div>
                  <div class="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider">{{ day.date }}</div>
                </div>
              </div>
              
              <!-- Value Tooltips (Visible on data peaks) -->
              <div class="absolute top-0 left-0 right-0 flex justify-between px-2 pointer-events-none">
                <div v-for="(day, i) in registrationChartData.days" :key="i" class="flex-1 flex justify-center">
                  <div 
                    v-if="day.count > 0"
                    class="group relative"
                    :style="{ transform: `translateY(${(1 - (day.count / (registrationChartData.maxCount || 1))) * 200 - 15}px)` }"
                  >
                    <div class="px-2 py-0.5 rounded-full bg-background border shadow-sm text-[10px] font-bold text-primary transition-all duration-300">
                      {{ day.count }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="mt-8 flex items-center justify-center space-x-2 text-xs text-muted-foreground font-medium">
            <div class="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
            <span>Total de {{ registrationChartData.days.reduce((sum, d) => sum + d.count, 0) }} dispositivos registrados nos últimos 7 dias</span>
          </div>
        </CardContent>
      </Card>

      <!-- Filters -->
      <Card>
        <CardContent class="pt-6">
          <div class="flex flex-col sm:flex-row gap-4">
            <div class="flex-1">
              <div class="relative">
                <Icon name="lucide:search" class="absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  v-model="searchQuery"
                  placeholder="Buscar dispositivos por token, plataforma ou ID de usuário..."
                  class="pl-10"
                />
              </div>
            </div>
            <Select v-model="selectedPlatform">
              <SelectTrigger class="w-full sm:w-48">
                <SelectValue placeholder="Todas as plataformas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as plataformas</SelectItem>
                <SelectItem value="WEB">🌐 Todas Web</SelectItem>
                <SelectItem value="CHROME">🌐 Chrome</SelectItem>
                <SelectItem value="FIREFOX">🦊 Firefox</SelectItem>
                <SelectItem value="SAFARI">🧭 Safari</SelectItem>
                <SelectItem value="EDGE">🌊 Edge</SelectItem>
                <SelectItem value="OPERA">🎭 Opera</SelectItem>
                <SelectItem value="IOS">🍎 iOS</SelectItem>
                <SelectItem value="ANDROID">🤖 Android</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <!-- Devices Table -->
      <Card>
        <CardHeader>
          <CardTitle>Dispositivos ({{ filteredDevices.length }})</CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="devicesLoading" class="flex items-center justify-center py-8">
            <Icon name="lucide:loader-2" class="h-6 w-6 animate-spin" />
          </div>

          <div v-else-if="filteredDevices.length === 0" class="text-center py-8 text-muted-foreground">
            <Icon name="lucide:smartphone" class="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p class="text-lg font-medium mb-2">Nenhum dispositivo encontrado</p>
            <p class="text-sm">{{ devices.length === 0 ? 'Registre seu primeiro dispositivo para começar.' : 'Tente ajustar seus filtros de busca.' }}</p>
          </div>

          <Table v-else>
            <TableHeader>
              <TableRow>
                <TableHead class="w-[180px]">Plataforma</TableHead>
                <TableHead class="w-[120px]">Navegador/OS</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>ID de Usuário</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Visto por último</TableHead>
                <TableHead class="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="device in filteredDevices" :key="device.id" class="hover:bg-muted/50">
                <TableCell>
                  <div class="flex items-center space-x-3">
                    <div class="flex-shrink-0">
                      <span class="text-2xl">{{ getPlatformIcon(device.category || null, device.platform, device.metadata) }}</span>
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="font-medium text-sm">{{ getBasePlatformName(device.platform) }}</div>
                      <div class="text-xs text-muted-foreground">
                        {{ getPlatformDescription(device.platform, device.metadata) }}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="text-sm">
                    <div class="font-medium">{{ getBrowserDisplayName(device.category || null, device.platform, device.metadata) }}</div>
                    <div class="flex items-center space-x-2 text-xs text-muted-foreground mt-1">
                      <span v-if="getBrowserVersion(device.metadata)">{{ getBrowserVersion(device.metadata) }}</span>
                      <span v-if="getOSInfo(device.metadata)" class="text-blue-600">• {{ getOSInfo(device.metadata) }}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="font-mono text-xs">
                    <div class="bg-muted px-2 py-1 rounded max-w-[200px] truncate">
                      {{ device.token.substring(0, 30) }}...
                    </div>
                    <div class="text-[10px] text-muted-foreground mt-1">
                      {{ getTokenType(device.platform) }}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div v-if="device.userId" class="flex items-center space-x-1">
                    <span class="text-sm font-medium">{{ device.userId }}</span>
                    <Badge variant="outline" class="text-[10px] px-1">Usuário</Badge>
                  </div>
                  <div v-else class="flex items-center space-x-1">
                    <span class="text-muted-foreground text-sm">Anônimo</span>
                    <Badge variant="secondary" class="text-[10px] px-1">Visitante</Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge :variant="device.status === 'ACTIVE' ? 'default' : 'secondary'" class="flex items-center space-x-1">
                    <Icon v-if="device.status === 'ACTIVE'" name="lucide:check-circle" class="h-3 w-3" />
                    <Icon v-else name="lucide:x-circle" class="h-3 w-3" />
                    <span>{{ device.status === 'ACTIVE' ? 'Ativo' : 'Inativo' }}</span>
                  </Badge>
                </TableCell>
                <TableCell>
                  <div class="text-sm">
                    <div class="font-medium">{{ formatLastSeen(device.lastSeenAt) }}</div>
                    <div class="text-xs text-muted-foreground">
                      {{ device.createdAt ? formatDate(new Date(device.createdAt)) : 'Desconhecido' }}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="flex space-x-1">
                    <Button variant="ghost" size="sm" class="h-7 px-2" @click="deleteDevice(device.id)">
                      Excluir
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>

    <!-- Register Device Dialog -->
    <Dialog v-model:open="showRegisterDevice">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar Novo Dispositivo</DialogTitle>
          <DialogDescription>Adicione um novo dispositivo para receber notificações push</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="registerDevice">
          <div class="space-y-2">
            <Label for="device-token">Token do Dispositivo *</Label>
            <Input
              id="device-token"
              v-model="deviceForm.token"
              placeholder="Token de push do dispositivo..."
              required
            />
          </div>
          <div class="space-y-2">
            <Label for="device-platform">Plataforma *</Label>
            <Select v-model="deviceForm.platform" required>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="WEB">Web</SelectItem>
                <SelectItem value="IOS">iOS</SelectItem>
                <SelectItem value="ANDROID">Android</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label for="device-user-id">ID de Usuário (Opcional)</Label>
            <Input
              id="device-user-id"
              v-model="deviceForm.userId"
              placeholder="user123"
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" @click="showRegisterDevice = false">Cancelar</Button>
          <Button :disabled="isRegisteringDevice || !deviceForm.token" @click="registerDevice">
            <Icon v-if="isRegisteringDevice" name="lucide:loader-2" class="mr-2 size-4 animate-spin" />
            Registrar Dispositivo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Delete Device Dialog -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir Dispositivo</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir este dispositivo? Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <div class="space-y-4">
          <Alert variant="destructive">
            <Icon name="lucide:alert-triangle" class="size-4" />
            <AlertTitle>Aviso</AlertTitle>
            <AlertDescription>
              Este dispositivo não receberá mais notificações push. Todos os dados associados serão excluídos permanentemente.
            </AlertDescription>
          </Alert>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showDeleteDialog = false">Cancelar</Button>
          <Button variant="destructive" :disabled="isDeletingDevice" @click="confirmDeleteDevice">
            <Icon v-if="isDeletingDevice" name="lucide:loader-2" class="mr-2 size-4 animate-spin" />
            <Icon v-else name="lucide:trash-2" class="mr-2 size-4" />
            Excluir Dispositivo
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
