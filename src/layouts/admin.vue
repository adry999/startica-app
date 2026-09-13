<script setup lang="ts">
import { computed, ref } from 'vue'

const { t } = useI18n()
const { user, logout } = useAuth()
const { can } = usePermissions()
const tenantStore = useTenantStore()
const kindergartensStore = useKindergartensStore()

// These callbacks feed the Pinia stores rather than asyncData's own `data`,
// but they must still resolve to a non-null value: Nuxt treats undefined as
// "no payload" and refetches on the client, duplicating every request.
useLazyAsyncData('admin-kindergartens', async () => {
  await kindergartensStore.fetchAll()
  const first = kindergartensStore.items[0]
  if (first) tenantStore.autoSelectFirst(first.id)
  return true
})

// Single-KG mode: the tenant switcher is hidden, so the header renders no
// kindergarten selector. admin-kindergartens above still auto-selects the
// first kindergarten into the tenant store, which the pages read.
const navItems = computed(() => [
  { label: t('nav.overview'),      to: '/',               icon: 'i-heroicons-squares-2x2',      enabled: true },
  { label: t('nav.staff'),         to: '/staff',          icon: 'i-heroicons-user-group',        enabled: can('read', 'staff') },
  { label: t('nav.groups'),        to: '/groups',         icon: 'i-heroicons-users',             enabled: can('read', 'groups') },
  { label: t('nav.children'),      to: '/children',       icon: 'i-heroicons-academic-cap',      enabled: can('read', 'children') },
  { label: t('attendance.pageTitle'), to: '/attendance',   icon: 'i-heroicons-check-circle',      enabled: can('read', 'attendance') },
  { label: t('billing.pageTitle'),   to: '/billing',       icon: 'i-heroicons-document-currency-dollar', enabled: can('read', 'billing') },
  { label: t('payments.pageTitle'),  to: '/payments',      icon: 'i-heroicons-credit-card',      enabled: can('read', 'payments') },
  { label: t('expenses.pageTitle'),  to: '/expenses',      icon: 'i-heroicons-chart-bar',        enabled: can('read', 'expenses') },
  { label: t('nav.pool'),          to: '/pool',           icon: 'i-heroicons-lifebuoy',          enabled: can('view', 'pool', tenantStore.selectedKindergartenId) },
  { label: t('nav.payroll'),       to: '/payroll',        icon: 'i-heroicons-banknotes',         enabled: can('view', 'payroll', tenantStore.selectedKindergartenId) },
])

const userInitials = computed(() => {
  const name = user.value?.fullName ?? ''
  return name.trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('') || '?'
})

const searchQuery = ref('')

// Mobile drawer. The sidebar is static from `lg` up, so this only drives the
// small-screen overlay.
const route = useRoute()
const mobileNavOpen = ref(false)

// Navigating from inside the drawer should dismiss it, otherwise the new page
// renders hidden behind the overlay.
watch(() => route.fullPath, () => { mobileNavOpen.value = false })

// Prevent the page behind the overlay from scrolling while the drawer is open.
watch(mobileNavOpen, (open) => {
  if (import.meta.client) {
    document.body.style.overflow = open ? 'hidden' : ''
  }
})

function onEscape(e: KeyboardEvent) {
  if (e.key === 'Escape') mobileNavOpen.value = false
}

onMounted(() => document.addEventListener('keydown', onEscape))

onBeforeUnmount(() => {
  if (import.meta.client) {
    document.removeEventListener('keydown', onEscape)
    document.body.style.overflow = ''
  }
})

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
    <!-- Backdrop — mobile only, sits under the drawer and over the content -->
    <div
      v-if="mobileNavOpen"
      class="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
      aria-hidden="true"
      @click="mobileNavOpen = false"
    />

    <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
    <aside
      id="admin-sidebar"
      class="fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-y-auto bg-sidebar-bg transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0"
      :class="mobileNavOpen ? 'translate-x-0' : '-translate-x-full'"
      role="navigation"
      aria-label="Sidebar"
    >
      <!-- Logo -->
      <div class="flex items-center gap-3 px-5 py-5">
        <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-500" aria-hidden="true">
          <span class="text-sm font-bold text-white">S</span>
        </div>
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold text-white">{{ t('common.appName') }}</p>
          <p class="text-xs text-white/40">{{ t('common.adminPortal') }}</p>
        </div>
        <!-- Close — mobile only -->
        <button
          class="-mr-1 rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white lg:hidden"
          :aria-label="t('nav.closeMenu')"
          @click="mobileNavOpen = false"
        >
          <UIcon name="i-heroicons-x-mark" class="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <!-- Primary nav -->
      <nav class="flex-1 space-y-0.5 px-3 py-1" aria-label="Main navigation">
        <template v-for="item in navItems" :key="item.to">
          <NuxtLink
            v-if="item.enabled"
            :to="item.to"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/50 transition-colors hover:bg-white/8 hover:text-white/90"
            active-class="bg-white/12 text-white font-semibold"
            :aria-current="$route.path === item.to ? 'page' : undefined"
          >
            <UIcon :name="item.icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
            {{ item.label }}
          </NuxtLink>
          <span v-else class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/20 cursor-default" role="button" aria-disabled="true" tabindex="-1">
            <UIcon :name="item.icon" class="h-5 w-5 shrink-0" aria-hidden="true" />
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
      <nav class="border-t border-white/10 px-2 py-3 space-y-0.5" aria-label="Secondary navigation">
        <NuxtLink
          to="/settings"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white transition-colors"
          active-class="bg-white/10 text-white"
        >
          <UIcon name="i-heroicons-cog-6-tooth" class="h-5 w-5 shrink-0" aria-hidden="true" />
          {{ t('nav.settings') }}
        </NuxtLink>
        <button
          class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/50 hover:bg-white/5 hover:text-white transition-colors"
          :aria-label="t('auth.logout')"
          @click="onLogout"
        >
          <UIcon name="i-heroicons-arrow-right-on-rectangle" class="h-5 w-5 shrink-0" aria-hidden="true" />
          {{ t('auth.logout') }}
        </button>
      </nav>
    </aside>

    <!-- ── Main ─────────────────────────────────────────────────────────── -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Header -->
      <header class="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-white px-4 shadow-[0_1px_3px_rgba(16,24,40,0.04)] sm:px-6">
        <!-- Left: menu toggle (mobile) + global child search -->
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <button
            class="-ml-1 shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
            :aria-label="t('nav.openMenu')"
            :aria-expanded="mobileNavOpen"
            aria-controls="admin-sidebar"
            @click="mobileNavOpen = true"
          >
            <UIcon name="i-heroicons-bars-3" class="h-5 w-5" aria-hidden="true" />
          </button>
          <UInput
            v-model="searchQuery"
            icon="i-heroicons-magnifying-glass"
            :placeholder="t('topbar.searchPlaceholder')"
            size="sm"
            class="w-full max-w-[16rem]"
            :aria-label="t('topbar.searchPlaceholder')"
            @keydown.enter="onTopbarSearch"
          />
        </div>

        <!-- Right: user (kindergarten locked to single) -->
        <div class="flex shrink-0 items-center gap-2.5">
          <!-- Name/role collapse on narrow screens; the avatar always shows -->
          <div class="hidden text-right sm:block">
            <p class="text-sm font-semibold text-slate-800 leading-tight">{{ user?.fullName }}</p>
            <p class="text-xs text-slate-400 leading-tight">{{ user ? t(`auth.role.${user.role}`) : '' }}</p>
          </div>
          <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-sm font-semibold text-white ring-2 ring-white">
            {{ userInitials }}
          </span>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 overflow-auto p-4 sm:p-6 lg:p-8" role="main">
        <div class="mx-auto w-full max-w-[1400px]">
          <!-- A crashing page keeps the shell; retry or navigation clears the panel. -->
          <BasePageBoundary>
            <slot />
          </BasePageBoundary>
        </div>
      </main>
    </div>
  </div>
</template>
