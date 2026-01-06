<script setup lang="ts">
interface Props {
  appId: string
}

const _props = defineProps<Props>()
const route = useRoute()

const navigationItems = [
  {
    name: 'Visão Geral',
    href: `/apps/${_props.appId}`,
    icon: 'lucide:trending-up',
    current: route.path === `/apps/${_props.appId}`,
  },
  {
    name: 'Provedores',
    href: `/apps/${_props.appId}/providers`,
    icon: 'lucide:globe',
    current: route.path === `/apps/${_props.appId}/providers`,
  },
  {
    name: 'Dispositivos',
    href: `/apps/${_props.appId}/devices`,
    icon: 'lucide:smartphone',
    current: route.path === `/apps/${_props.appId}/devices`,
  },
  {
    name: 'Notificações',
    href: `/apps/${_props.appId}/notifications`,
    icon: 'lucide:activity',
    current: route.path === `/apps/${_props.appId}/notifications`,
  },
  {
    name: 'Automações',
    href: `/apps/${_props.appId}/automations`,
    icon: 'lucide:zap',
    current: route.path === `/apps/${_props.appId}/automations`,
  },
  {
    name: 'Configurações',
    href: `/apps/${_props.appId}/settings`,
    icon: 'lucide:cog',
    current: route.path === `/apps/${_props.appId}/settings`,
  },
]
</script>

<template>
  <nav class="flex space-x-1 mb-8 border-b">
    <NuxtLink
      v-for="item in navigationItems"
      :key="item.name"
      :to="item.href"
      class="flex items-center px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors"
      :class="[
        item.current
          ? 'text-primary border-primary bg-primary/5'
          : 'text-muted-foreground border-transparent hover:text-foreground hover:border-border',
      ]"
    >
      <Icon :name="item.icon" class="mr-2 size-4" />
      {{ item.name }}
    </NuxtLink>
  </nav>
</template>
