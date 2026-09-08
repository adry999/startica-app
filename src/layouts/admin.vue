<script setup lang="ts">
import { computed, ref } from 'vue'

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

const selectedKgLabel = computed(() => {
  const id = tenantStore.selectedKindergartenId
  if (id === 'ALL') return t('tenant.all')
  return kindergartensStore.items.find(k => k.id === id)?.name ?? '—'
})

const navItems = computed(() => [
  { label: t('nav.overview'),      to: '/',               icon: 'i-heroicons-squares-2x2',      enabled: true },
  { label: t('nav.kindergartens'), to: '/kindergartens',  icon: 'i-heroicons-building-office-2', enabled: can('read', 'kindergarten') },
  { label: t('nav.staff'),         to: '/staff',          icon: 'i-heroicons-user-group',        enabled: can('read', 'staff') },
  { label: t('nav.groups'),        to: '/groups',         icon: 'i-heroicons-users',             enabled: can('read', 'groups') },
  { label: t('nav.children'),      to: '/children',       icon: 'i-heroicons-academic-cap',      enabled: can('read', 'children') },
  { label: t('attendance.pageTitle'), to: '/attendance',   icon: 'i-heroicons-check-circle',      enabled: can('read', 'attendance') },
])

const userInitials = computed(() => {
  const name = user.value?.fullName ?? ''
  return name.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') || '?'
})

const searchQuery = ref('')

async function onTopbarSearch() {
  const q = searchQuery.value.trim()
  await navigateTo({ path: '/children', query: q ? { q } : undefined })
  searchQuery.value = ''
}

async function onLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex min-h-screen bg-app-bg font-sans">
    <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
    <aside class="flex w-64 shrink-0 flex-col bg-sidebar-bg">
      <!-- Logo -->
      <div class="flex items-center gap-3 px-5 py-5">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500">
          <span class="text-sm font-bold text-white">S</span>
        </div>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-white">{{ t('common.appName') }}</p>
          <p class="text-xs text-white/40">{{ t('common.adminPortal') }}</p>
        </div>
      </div>

      <!-- Primary nav -->
      <nav class="flex-1 space-y-0.5 px-3 py-1">
        <template v-for="item in navItems" :key="item.to">
          <NuxtLink
            v-if="item.enabled"
            :to="item.to"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/50 transition-colors hover:bg-white/8 hover:text-white/90"
            active-class="bg-white/12 text-white font-semibold"
          >
            <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
            {{ item.label }}
          </NuxtLink>
          <span v-else class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/20 cursor-default">
            <UIcon :name="item.icon" class="h-5 w-5 shrink-0" />
            <span class="flex-1">{{ item.label }}</span>
            <span class="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/40">{{ t('nav.comingSoon') }}</span>
          </span>
        </template>
      </nav>

      <!-- Primary CTA (mockup: "New Registration") -->
      <div v-if="can('create', 'children')" class="px-3 pb-2">
        <UButton color="primary" block icon="i-heroicons-plus" @click="navigateTo('/children?add=1')">
          {{ t('children.addTitle') }}
        </UButton>
      </div>

      <!-- Bottom: Settings + Logout -->
      <div class="border-t border-white/10 px-2 py-3 space-y-0.5">
        <NuxtLink
          to="/settings"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white transition-colors"
          active-class="bg-white/10 text-white"
        >
          <UIcon name="i-heroicons-cog-6-tooth" class="h-5 w-5 shrink-0" />
          {{ t('nav.settings') }}
        </NuxtLink>
        <button
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white transition-colors"
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
      <header class="flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-6 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
        <!-- Left: global child search -->
        <div class="flex flex-1 items-center">
          <UInput
            v-model="searchQuery"
            icon="i-heroicons-magnifying-glass"
            :placeholder="t('topbar.searchPlaceholder')"
            size="sm"
            class="w-64"
            @keydown.enter="onTopbarSearch"
          />
        </div>

        <!-- Right: kg selector + user -->
        <div class="flex items-center gap-3">
          <!-- Kindergarten selector (admin/super-admin with multiple) -->
          <div
            v-if="can('read', 'staff') && tenantOptions.length > 1"
            class="flex items-center gap-2 rounded-lg border border-border bg-app-bg px-3 py-1.5 hover:bg-slate-50 transition-colors"
          >
            <UIcon name="i-heroicons-building-office-2" class="h-4 w-4 shrink-0 text-slate-400" />
            <select
              :value="tenantStore.selectedKindergartenId"
              class="max-w-[160px] truncate bg-transparent text-sm font-medium text-slate-700 outline-none cursor-pointer"
              @change="(e) => tenantStore.selectKindergarten((e.target as HTMLSelectElement).value)"
            >
              <option v-for="opt in tenantOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <UIcon name="i-heroicons-chevron-down" class="h-3.5 w-3.5 shrink-0 text-slate-400" />
          </div>
          <!-- Single kindergarten: just show label -->
          <div v-else-if="can('read', 'staff') && tenantOptions.length === 1" class="flex items-center gap-2 text-sm text-slate-500">
            <UIcon name="i-heroicons-building-office-2" class="h-4 w-4 text-slate-400" />
            <span class="font-medium text-slate-700">{{ selectedKgLabel }}</span>
          </div>

          <!-- Divider -->
          <div class="h-6 w-px bg-border" />

          <!-- User avatar + info -->
          <div class="flex items-center gap-2.5">
            <div class="text-right">
              <p class="text-sm font-semibold text-slate-800 leading-tight">{{ user?.fullName }}</p>
              <p class="text-xs text-slate-400 leading-tight">{{ user ? t(`auth.role.${user.role}`) : '' }}</p>
            </div>
            <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold text-white ring-2 ring-white">
              {{ userInitials }}
            </span>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 overflow-auto p-8">
        <div class="mx-auto w-full max-w-[1400px]">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
