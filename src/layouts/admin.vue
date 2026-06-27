<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()
const { user, logout } = useAuth()
const { can } = usePermissions()
const tenantStore = useTenantStore()
const kindergartensStore = useKindergartensStore()

useLazyAsyncData('admin-kindergartens', async () => {
  await kindergartensStore.fetchAll()
  if (!can('read', 'kindergarten') && tenantStore.selectedKindergartenId === 'ALL') {
    const first = kindergartensStore.items[0]
    if (first) tenantStore.selectKindergarten(first.id)
  }
})

const tenantOptions = computed(() => {
  const options: Array<{ label: string; value: string }> = []
  if (can('read', 'kindergarten')) {
    options.push({ label: t('tenant.all'), value: 'ALL' })
  }
  for (const kg of kindergartensStore.items) {
    options.push({ label: kg.name, value: kg.id })
  }
  return options
})

const navItems = computed(() => [
  { label: t('nav.overview'),      to: '/',               icon: 'i-heroicons-squares-2x2',      enabled: true },
  { label: t('nav.kindergartens'), to: '/kindergartens',  icon: 'i-heroicons-building-office-2', enabled: can('read', 'kindergarten') },
  { label: t('nav.staff'),         to: '/staff',          icon: 'i-heroicons-user-group',        enabled: can('read', 'staff') },
  { label: t('nav.groups'),        to: '/groups',         icon: 'i-heroicons-users',             enabled: false },
  { label: t('nav.children'),      to: '/children',       icon: 'i-heroicons-academic-cap',      enabled: false },
])

const userInitials = computed(() => {
  const name = user.value?.fullName ?? ''
  return name.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') || '?'
})

async function onLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex min-h-screen bg-app-bg font-sans">
    <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
    <aside class="flex w-64 shrink-0 flex-col bg-slate-800">
      <!-- Logo -->
      <div class="flex items-center gap-3 px-5 py-5">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600">
          <span class="text-sm font-bold text-white">S</span>
        </div>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-white">{{ t('common.appName') }}</p>
          <p class="text-xs text-slate-400">{{ t('common.adminPortal') }}</p>
        </div>
      </div>

      <!-- Tenant selector -->
      <div v-if="can('read', 'staff')" class="px-3 pb-3">
        <USelect
          :model-value="tenantStore.selectedKindergartenId"
          :items="tenantOptions"
          size="sm"
          class="w-full"
          @update:model-value="(v) => tenantStore.selectKindergarten(v as string)"
        />
      </div>

      <!-- Primary nav -->
      <nav class="flex-1 space-y-0.5 px-2 py-1">
        <template v-for="item in navItems" :key="item.to">
          <NuxtLink
            v-if="item.enabled"
            :to="item.to"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
            active-class="bg-teal-600/10 text-teal-300"
          >
            <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
            {{ item.label }}
          </NuxtLink>
          <span v-else class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 cursor-default">
            <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
            <span class="flex-1">{{ item.label }}</span>
            <UBadge size="xs" color="neutral" variant="soft">{{ t('nav.comingSoon') }}</UBadge>
          </span>
        </template>
      </nav>

      <!-- Bottom: Settings + Logout -->
      <div class="border-t border-slate-700 px-2 py-3 space-y-0.5">
        <NuxtLink
          to="/settings"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          active-class="bg-teal-600/10 text-teal-300"
        >
          <UIcon name="i-heroicons-cog-6-tooth" class="h-5 w-5 shrink-0" />
          {{ t('nav.settings') }}
        </NuxtLink>
        <button
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white"
          @click="onLogout"
        >
          <UIcon name="i-heroicons-arrow-right-on-rectangle" class="h-5 w-5 shrink-0" />
          {{ t('auth.logout') }}
        </button>
      </div>
    </aside>

    <!-- ── Main ─────────────────────────────────────────────────────────── -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Header -->
      <header class="flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-6">
        <span class="text-sm text-slate-400">{{ t('common.appName') }}</span>
        <div class="flex items-center gap-4">
          <LanguageSwitcher />
          <div class="flex items-center gap-3">
            <div class="text-right">
              <p class="text-sm font-medium text-slate-800 leading-tight">{{ user?.fullName }}</p>
              <p class="text-xs text-slate-400">{{ user ? t(`auth.role.${user.role}`) : '' }}</p>
            </div>
            <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold text-white">
              {{ userInitials }}
            </span>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 overflow-auto p-8">
        <slot />
      </main>
    </div>
  </div>
</template>
