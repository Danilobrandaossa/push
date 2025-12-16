import { useMutation, useQuery, useQueryCache } from '@pinia/colada'

// Automations queries
export function useAutomations(appId?: Ref<string | null> | string | null) {
  const appIdRef = appId ? (isRef(appId) ? appId : ref(appId)) : ref(null)

  return useQuery({
    key: () => ['automations', appIdRef.value],
    query: async () => {
      const result = await $sdk.automations({ appId: appIdRef.value || undefined })
      return result.data?.automations || []
    },
    enabled: () => !appIdRef.value || appIdRef.value !== '',
  })
}

export function useAutomation(id: Ref<string | null> | string | null) {
  const automationId = ref(id)

  return useQuery({
    key: () => ['automation', automationId.value],
    query: async () => {
      if (!automationId.value)
        return null
      const result = await $sdk.automation({ id: automationId.value })
      return result.data?.automation || null
    },
    enabled: () => !!automationId.value && automationId.value !== '',
  })
}

// Automations mutations
export function useCreateAutomation() {
  const queryCache = useQueryCache()

  return useMutation({
    mutation: async (input: {
      appId: string
      name: string
      description?: string
      type: 'SUBSCRIPTION' | 'RECURRING'
      notificationTemplate: any
      delayMinutes?: number
      frequency?: 'DAILY' | 'WEEKLY'
      timeOfDay?: string
      daysOfWeek?: number[]
      startDate?: string
      endDate?: string
    }) => {
      const result = await $sdk.createAutomation({ input })
      return result.data?.createAutomation || null
    },
    onSuccess: (_data, input) => {
      queryCache.invalidateQueries({ key: ['automations', input.appId] })
      queryCache.invalidateQueries({ key: ['automations'] })
    },
  })
}

export function useUpdateAutomation() {
  const queryCache = useQueryCache()

  return useMutation({
    mutation: async ({ id, input }: { id: string, input: any }) => {
      const result = await $sdk.updateAutomation({ id, input })
      return result.data?.updateAutomation || null
    },
    onSuccess: (_data, { id }) => {
      queryCache.invalidateQueries({ key: ['automation', id] })
      queryCache.invalidateQueries({ key: ['automations'] })
    },
  })
}

export function useDeleteAutomation() {
  const queryCache = useQueryCache()

  return useMutation({
    mutation: async (id: string) => {
      const result = await $sdk.deleteAutomation({ id })
      return result.data?.deleteAutomation || false
    },
    onSuccess: () => {
      queryCache.invalidateQueries({ key: ['automations'] })
    },
  })
}

export function useToggleAutomation() {
  const queryCache = useQueryCache()

  return useMutation({
    mutation: async (id: string) => {
      const result = await $sdk.toggleAutomation({ id })
      return result.data?.toggleAutomation || null
    },
    onSuccess: (_data, id) => {
      queryCache.invalidateQueries({ key: ['automation', id] })
      queryCache.invalidateQueries({ key: ['automations'] })
    },
  })
}

