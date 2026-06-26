<script setup lang="ts">
import { onMounted, computed } from 'vue'

const { t } = useI18n()
const { user, logout } = useAuth()
const tenantStore = useTenantStore()
const kindergartensStore = useKindergartensStore()

onMounted(async () => {
  await kindergartensStore.fetchAll()
  // Auto-select the first kindergarten for Admin users (they don't need the ALL view)
  if (user.value?.role === 'admin' && tenantStore.selectedKindergartenId === 'ALL') {
    const first = kindergartensStore.items[0]
    if (first) tenantStore.selectKindergarten(first.id)
  }
})

const tenantOptions = computed(() => {
  const options = []
  if (user.value?.role === 'super_admin') {
    options.push({ label: t('tenant.all'), value: 'ALL' })
  }
  for (const kg of kindergartensStore.items) {
    options.push({ label: kg.name, value: kg.id })
  }
  return options
})

const navItems = computed(() => [
  { label: t('nav.overview'), to: '/', enabled: true },
  { label: t('nav.kindergartens'), to: '/kindergartens', enabled: user.value?.role === 'super_admin' },
  {
    label: t('nav.staff'),
    to: '/staff',
    enabled: user.value?.role === 'super_admin' || user.value?.role === 'admin',
  },
  { label: t('nav.groups'), to: '/groups', enabled: false },
  { label: t('nav.children'), to: '/children', enabled: false },
])

async function onLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex min-h-screen bg-app-bg">
    <aside class="flex w-64 flex-col bg-neutral-600 text-white">
      <div class="px-6 py-5 text-lg font-semibold">{{ t('common.appName') }}</div>
      <nav class="flex-1 space-y-1 px-3">
        <template v-for="item in navItems" :key="item.to">
          <NuxtLink
            v-if="item.enabled"
            :to="item.to"
            class="block rounded-md px-3 py-2 text-sm font-medium hover:bg-white/10"
            active-class="bg-teal-700"
          >
            {{ item.label }}
          </NuxtLink>
          <span v-else class="flex items-center justify-between rounded-md px-3 py-2 text-sm text-white/40">
            {{ item.label }}
            <UBadge size="xs" color="neutral" variant="soft">{{ t('nav.comingSoon') }}</UBadge>
          </span>
        </template>
      </nav>
    </aside>

    <div class="flex flex-1 flex-col">
      <header class="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6">
        <USelect
          v-if="user?.role === 'super_admin' || user?.role === 'admin'"
          :model-value="tenantStore.selectedKindergartenId"
          :items="tenantOptions"
          class="w-56"
          @update:model-value="(value) => tenantStore.selectKindergarten(value as string)"
        />
        <div class="flex items-center gap-4">
          <LanguageSwitcher />
          <span class="text-sm text-neutral-600">{{ user?.fullName }}</span>
          <UButton color="neutral" variant="ghost" size="sm" @click="onLogout">
            {{ t('auth.logout') }}
          </UButton>
        </div>
      </header>

      <main class="flex-1 p-8">
        <slot />
      </main>
    </div>
  </div>
</template>
