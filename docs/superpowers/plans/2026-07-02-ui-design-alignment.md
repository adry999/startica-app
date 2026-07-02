# UI Design Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the app's tokens, layout shell, and repeated UI patterns to `design/mockups/startica_core/DESIGN.md` per the approved spec `docs/superpowers/specs/2026-07-02-ui-design-alignment-design.md`.

**Architecture:** Three layers: (1) re-point existing Tailwind `@theme` token values in one CSS file so the whole app re-skins without template churn; (2) shell pass on `src/layouts/admin.vue` (max-width container, topbar child search, sidebar CTA); (3) three presentational `Base*` components in `src/shared/ui/` adopted by all six list/dashboard pages.

**Tech Stack:** Nuxt 3 (srcDir `src/`), Tailwind CSS v4 (`@theme` in CSS, no tailwind.config), Nuxt UI v3, Vitest 4 + @vue/test-utils + happy-dom (new), vue-i18n via @nuxtjs/i18n.

## Global Constraints

- **No hardcoded user-facing strings** — every string through i18n keys, in BOTH `src/core/i18n/locales/ro.json` and `en.json` (RO is default).
- **No raw hex colors in templates** — only token utilities (`teal-*`, `slate-*`, `border`, `app-bg`, `sidebar-bg`, `brand-*`, `success`/`warning`/`error`).
- **`shared/ui` has zero business logic** — props in, events out; no store/service/composable imports in Base components.
- **Commit format:** `type(scope): message` (repo convention, e.g. `feat(ui): …`).
- **Do NOT stage or touch `supabase/seed.sql`** — it has unrelated uncommitted changes. Always `git add` specific files, never `git add -A`.
- Existing class names keep their meaning: `text-teal-600` etc. re-point automatically after Task 1 — do not "fix" color classes in files this plan doesn't touch.
- Verification commands: `npm run lint`, `npm run typecheck`, `npm run test` (all must pass at the end of every task that changes code).

---

### Task 1: Token alignment (UI-0)

**Files:**
- Modify: `src/assets/css/main.css` (full rewrite of the `@theme` block, shown below)
- Modify: `CLAUDE.md` (palette source line)
- Modify: `docs/Startica_DesignPrompt.md` (superseded banner at line 1)

**Interfaces:**
- Produces: token utilities `text-display` (32px/40px, weight 600, −0.02em) used by Task 2's `BasePageHeader`; re-pointed `teal-*`/`slate-*`/`sidebar-bg` values consumed everywhere.

- [ ] **Step 1: Replace `src/assets/css/main.css` with this exact content**

```css
@import "tailwindcss";
@import "@nuxt/ui";

/*
 * Design tokens from design/mockups/startica_core/DESIGN.md — the single
 * source of truth for palette, radii, and type scale (decision 2026-07-02,
 * see docs/superpowers/specs/2026-07-02-ui-design-alignment-design.md).
 * Never hardcode a color — always reference these tokens.
 */
@theme {
  /* Teal — primary/interactive (buttons, links, active nav, focus rings).
   * Ramp built around DESIGN.md primary #005752 (verified against mockup
   * PNGs: buttons sample #004E48–#00524D, active nav #094F4D). */
  --color-teal-50: #E4F0EE;
  --color-teal-100: #C7E0DD;
  --color-teal-200: #93C0BB;
  --color-teal-300: #4E938C;
  --color-teal-400: #1F706A;
  --color-teal-500: #005752;
  --color-teal-600: #004A46;
  --color-teal-700: #003B38;

  /*
   * Neutral — ink family (text, borders, surfaces). Named "slate" rather
   * than "neutral": Nuxt UI reserves the literal Tailwind color name
   * "neutral" for its own built-in gray internally, so overriding it under
   * that exact name gets bypassed. app.config.ts maps ui.colors.neutral to
   * 'slate', and Nuxt UI bridges it back to the neutral-* utility classes
   * (text-neutral-600 etc. still work and resolve to these hexes).
   * 400/500/600 are DESIGN.md ink-400/ink-500/ink-700; 800 is ink-900.
   */
  --color-slate-50: #F4F6F6;
  --color-slate-100: #E7EAEA;
  --color-slate-200: #D2D7D8;
  --color-slate-300: #AEB6B9;
  --color-slate-400: #889094;
  --color-slate-500: #636C70;
  --color-slate-600: #434E53;
  --color-slate-800: #131D21;

  /* Brand colors (from the logo) — accents only, never primary buttons */
  --color-brand-slate: #434E53;
  --color-brand-yellow: #FAD25B;
  --color-brand-gold: #C98A2B;
  --color-brand-peach: #F2CAA7;
  --color-brand-sage: #AFC1BE;
  --color-brand-cream: #E8EAE0;

  /* Semantic — single tone each per DESIGN.md (not full ramps) */
  --color-success: #3E8A6E;
  --color-warning: #D89B3F;
  --color-error: #C0553D;
  --color-info: #3B7A9E;

  /* Role badges */
  --color-role-super-admin-bg: #005752;
  --color-role-super-admin-text: #FFFFFF;
  --color-role-admin-bg: #FAD25B;
  --color-role-admin-text: #6B4E16;
  --color-role-educator-bg: #AFC1BE;
  --color-role-educator-text: #2A3B38;

  /* Surfaces */
  --color-surface: #FFFFFF;
  --color-sidebar-bg: #2C363A;
  --color-app-bg: #F6F7F5;
  --color-sidebar-tint: #E8EAE0;
  --color-border: #E3E7E5;

  /* Typography */
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;

  /* Display style for page titles (DESIGN.md: 32/40, 600, -0.02em) */
  --text-display: 2rem;
  --text-display--line-height: 2.5rem;
  --text-display--font-weight: 600;
  --text-display--letter-spacing: -0.02em;

  /* Layout (DESIGN.md: structural 16px, interactive 10px) */
  --radius-card: 16px;
  --radius-control: 10px;
}

/*
 * Nuxt UI computes control radii from --ui-radius (default 0.25rem).
 * 0.4rem scales buttons/inputs to ≈10px — DESIGN.md interactive radius.
 */
:root {
  --ui-radius: 0.4rem;
}
```

- [ ] **Step 2: Update the palette pointer in `CLAUDE.md`**

Find this line (in "## Design assets & handoff"):

```markdown
- **Palette tokens** come from `docs/Startica_DesignPrompt.md`. Never invent color values — use the defined tokens.
```

Replace with:

```markdown
- **Palette tokens** come from `design/mockups/startica_core/DESIGN.md` (single design source of truth since 2026-07-02; `docs/Startica_DesignPrompt.md` is superseded for palette/radius/type-scale). Never invent color values — use the defined tokens.
```

- [ ] **Step 3: Add superseded banner to `docs/Startica_DesignPrompt.md`**

Insert as the very first lines of the file (before any existing content):

```markdown
> **SUPERSEDED (2026-07-02):** For palette, radii, and type scale, the source of truth is now `design/mockups/startica_core/DESIGN.md` (see `docs/superpowers/specs/2026-07-02-ui-design-alignment-design.md`). This document remains valid for UX copy: screen inventory, component states, and accessibility notes.

```

- [ ] **Step 4: Verify**

Run: `npm run lint && npm run typecheck`
Expected: both pass (CSS-only + docs change; no TS surface changed).

- [ ] **Step 5: Commit**

```bash
git add src/assets/css/main.css CLAUDE.md docs/Startica_DesignPrompt.md
git commit -m "feat(ui): align design tokens to mockup DESIGN.md palette (UI-0)"
```

---

### Task 2: Component-test infrastructure + BasePageHeader

**Files:**
- Modify: `package.json` (via `npm i -D`), `vitest.config.ts`
- Create: `src/shared/ui/BasePageHeader.vue`
- Test: `src/shared/ui/BasePageHeader.test.ts`

**Interfaces:**
- Produces: `BasePageHeader` — props `{ title: string; subtitle?: string }`, slot `actions`. Auto-imported in pages via the Nuxt `components.dirs` entry for `~/shared/ui` (no import statement needed in `.vue` pages).

- [ ] **Step 1: Install component-test dependencies**

Run: `npm i -D @vue/test-utils happy-dom @vitejs/plugin-vue`
Expected: exits 0, three packages added to `devDependencies`.

- [ ] **Step 2: Register the Vue plugin in `vitest.config.ts`**

Replace the file content with:

```ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('./src', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

(Component tests opt into the DOM per-file with a `// @vitest-environment happy-dom` pragma; existing node-env tests are untouched.)

- [ ] **Step 3: Write the failing test — `src/shared/ui/BasePageHeader.test.ts`**

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BasePageHeader from './BasePageHeader.vue'

describe('BasePageHeader', () => {
  it('renders title and subtitle', () => {
    const wrapper = mount(BasePageHeader, {
      props: { title: 'Copii', subtitle: 'Gestionează profilurile copiilor' },
    })
    expect(wrapper.find('h1').text()).toBe('Copii')
    expect(wrapper.text()).toContain('Gestionează profilurile copiilor')
  })

  it('omits subtitle when not provided and renders the actions slot', () => {
    const wrapper = mount(BasePageHeader, {
      props: { title: 'Copii' },
      slots: { actions: '<button id="cta">Add</button>' },
    })
    expect(wrapper.find('p').exists()).toBe(false)
    expect(wrapper.find('#cta').exists()).toBe(true)
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/shared/ui/BasePageHeader.test.ts`
Expected: FAIL — cannot resolve `./BasePageHeader.vue`.

- [ ] **Step 5: Implement `src/shared/ui/BasePageHeader.vue`**

```vue
<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <div class="flex items-start justify-between gap-4">
    <div>
      <h1 class="text-display text-slate-800">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-sm text-slate-500">{{ subtitle }}</p>
    </div>
    <div class="flex shrink-0 items-center gap-3">
      <slot name="actions" />
    </div>
  </div>
</template>
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/shared/ui/BasePageHeader.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Full verification + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add package.json package-lock.json vitest.config.ts src/shared/ui/BasePageHeader.vue src/shared/ui/BasePageHeader.test.ts
git commit -m "feat(ui): add BasePageHeader + component-test infrastructure"
```

---

### Task 3: BaseStatCard

**Files:**
- Create: `src/shared/ui/BaseStatCard.vue`
- Test: `src/shared/ui/BaseStatCard.test.ts`

**Interfaces:**
- Produces: `BaseStatCard` — props `{ label: string; value?: string | number; icon?: string; iconClass?: string; loading?: boolean }`; default slot overrides the value rendering; slot `meta` renders a secondary line. `iconClass` carries the bubble's bg + icon text color classes (e.g. `'bg-teal-50 text-teal-600'`).

- [ ] **Step 1: Write the failing test — `src/shared/ui/BaseStatCard.test.ts`**

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseStatCard from './BaseStatCard.vue'

const globalStubs = { stubs: { UIcon: true } }

describe('BaseStatCard', () => {
  it('renders label and value', () => {
    const wrapper = mount(BaseStatCard, { props: { label: 'Total copii', value: 42 }, global: globalStubs })
    expect(wrapper.text()).toContain('Total copii')
    expect(wrapper.text()).toContain('42')
  })

  it('shows a pulse placeholder instead of the value while loading', () => {
    const wrapper = mount(BaseStatCard, { props: { label: 'Total copii', value: 42, loading: true }, global: globalStubs })
    expect(wrapper.find('.animate-pulse').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('42')
  })

  it('renders default slot as value override and meta slot', () => {
    const wrapper = mount(BaseStatCard, {
      props: { label: 'Prezență' },
      slots: { default: '<em>în curând</em>', meta: '+2 luna aceasta' },
      global: globalStubs,
    })
    expect(wrapper.find('em').text()).toBe('în curând')
    expect(wrapper.text()).toContain('+2 luna aceasta')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/ui/BaseStatCard.test.ts`
Expected: FAIL — cannot resolve `./BaseStatCard.vue`.

- [ ] **Step 3: Implement `src/shared/ui/BaseStatCard.vue`**

```vue
<script setup lang="ts">
defineProps<{
  label: string
  value?: string | number
  icon?: string
  iconClass?: string
  loading?: boolean
}>()
</script>

<template>
  <div class="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
    <div class="flex items-center justify-between">
      <p class="text-xs font-medium uppercase tracking-widest text-slate-400">{{ label }}</p>
      <div
        v-if="icon"
        :class="['flex h-9 w-9 items-center justify-center rounded-xl', iconClass ?? 'bg-teal-50 text-teal-600']"
      >
        <UIcon :name="icon" class="h-5 w-5" />
      </div>
    </div>
    <p class="mt-3 text-3xl font-semibold tabular-nums text-slate-800">
      <span v-if="loading" class="animate-pulse text-slate-200">—</span>
      <slot v-else-if="$slots.default" />
      <span v-else>{{ value ?? '—' }}</span>
    </p>
    <p v-if="$slots.meta" class="mt-1 text-xs text-slate-400">
      <slot name="meta" />
    </p>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/ui/BaseStatCard.test.ts`
Expected: PASS (3 tests). (The `UIcon` stub keeps the test independent of Nuxt UI.)

- [ ] **Step 5: Verify + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add src/shared/ui/BaseStatCard.vue src/shared/ui/BaseStatCard.test.ts
git commit -m "feat(ui): add BaseStatCard shared component"
```

---

### Task 4: BaseFilterTabs

**Files:**
- Create: `src/shared/ui/BaseFilterTabs.vue`
- Test: `src/shared/ui/BaseFilterTabs.test.ts`

**Interfaces:**
- Produces: `BaseFilterTabs` — **generic** component (`generic="T extends string"`): props `{ items: Array<{ label: string; value: T }>; modelValue: T }`, emits `update:modelValue` with `T`. Generic so pages can `v-model` union-typed refs (`'all' | 'enrolled' | …`) without casts.

- [ ] **Step 1: Write the failing test — `src/shared/ui/BaseFilterTabs.test.ts`**

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BaseFilterTabs from './BaseFilterTabs.vue'

const items = [
  { label: 'Toți', value: 'all' },
  { label: 'Activi', value: 'active' },
]

describe('BaseFilterTabs', () => {
  it('renders one button per item and highlights the active one', () => {
    const wrapper = mount(BaseFilterTabs, { props: { items, modelValue: 'active' } })
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[1]!.classes()).toContain('bg-white')
    expect(buttons[0]!.classes()).not.toContain('bg-white')
  })

  it('emits update:modelValue with the clicked value', async () => {
    const wrapper = mount(BaseFilterTabs, { props: { items, modelValue: 'all' } })
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['active']])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/ui/BaseFilterTabs.test.ts`
Expected: FAIL — cannot resolve `./BaseFilterTabs.vue`.

- [ ] **Step 3: Implement `src/shared/ui/BaseFilterTabs.vue`** (segmented pill control per the staff mockup)

```vue
<script setup lang="ts" generic="T extends string">
defineProps<{
  items: Array<{ label: string; value: T }>
  modelValue: T
}>()

defineEmits<{
  (e: 'update:modelValue', value: T): void
}>()
</script>

<template>
  <div class="inline-flex rounded-full bg-slate-100 p-1">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      :class="[
        'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
        item.value === modelValue
          ? 'bg-white text-slate-800 shadow-sm'
          : 'text-slate-500 hover:text-slate-600',
      ]"
      @click="$emit('update:modelValue', item.value)"
    >
      {{ item.label }}
    </button>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/ui/BaseFilterTabs.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Verify + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add src/shared/ui/BaseFilterTabs.vue src/shared/ui/BaseFilterTabs.test.ts
git commit -m "feat(ui): add BaseFilterTabs segmented control"
```

---

### Task 5: Shell pass — admin layout (UI-1)

**Files:**
- Modify: `src/layouts/admin.vue`
- Modify: `src/core/i18n/locales/ro.json`, `src/core/i18n/locales/en.json`

**Interfaces:**
- Consumes: nothing new (token change from Task 1 re-colors the sidebar automatically).
- Produces: topbar search navigates to `/children?q=<text>`; sidebar CTA navigates to `/children?add=1`. Task 6 implements the receiving side of both query params.

- [ ] **Step 1: Add the i18n key to both locales**

In `src/core/i18n/locales/ro.json`, add a new top-level object (sibling of `"common"`):

```json
"topbar": {
  "searchPlaceholder": "Caută copil…"
},
```

In `src/core/i18n/locales/en.json`, same position:

```json
"topbar": {
  "searchPlaceholder": "Search child…"
},
```

- [ ] **Step 2: Add search state to `src/layouts/admin.vue` script**

Change the vue import at the top of `<script setup>`:

```ts
import { computed, ref } from 'vue'
```

Add after the `userInitials` computed (before `onLogout`):

```ts
const searchQuery = ref('')

async function onTopbarSearch() {
  const q = searchQuery.value.trim()
  await navigateTo({ path: '/children', query: q ? { q } : undefined })
  searchQuery.value = ''
}
```

- [ ] **Step 3: Replace the empty topbar placeholder with the search input**

In the `<header>`, replace:

```html
        <!-- Left: breadcrumb / page context (empty placeholder keeps layout stable) -->
        <div class="flex-1" />
```

with:

```html
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
```

- [ ] **Step 4: Add the sidebar CTA**

Between the closing `</nav>` and the `<!-- Bottom: Settings + Logout -->` block, insert:

```html
      <!-- Primary CTA (mockup: "New Registration") -->
      <div v-if="can('create', 'children')" class="px-3 pb-2">
        <UButton color="primary" block icon="i-heroicons-plus" @click="navigateTo('/children?add=1')">
          {{ t('children.addTitle') }}
        </UButton>
      </div>
```

- [ ] **Step 5: Wrap the page content in a max-width container**

Replace:

```html
      <main class="flex-1 overflow-auto p-8">
        <slot />
      </main>
```

with:

```html
      <main class="flex-1 overflow-auto p-8">
        <div class="mx-auto w-full max-w-[1400px]">
          <slot />
        </div>
      </main>
```

- [ ] **Step 6: Verify + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add src/layouts/admin.vue src/core/i18n/locales/ro.json src/core/i18n/locales/en.json
git commit -m "feat(layout): shell pass — max-width container, topbar child search, sidebar CTA (UI-1)"
```

---

### Task 6: ChildrenListPage — query params + Base component adoption

**Files:**
- Modify: `src/modules/children/pages/ChildrenListPage.vue`

**Interfaces:**
- Consumes: `BasePageHeader { title, subtitle, #actions }`, `BaseStatCard { label, value }`, `BaseFilterTabs { items, v-model }` (auto-imported); query params `q` and `add=1` produced by Task 5.

- [ ] **Step 1: Wire route query params in the script**

Change the vue import (line 2) to include `watch`:

```ts
import { h, reactive, ref, computed, watch } from 'vue'
```

Replace the search/filter section:

```ts
// ── Search + filter ────────────────────────────────────────────────────────
const search = ref('')
const activeFilter = ref<'all' | 'enrolled' | 'withdrawn' | 'graduated'>('enrolled')
```

with:

```ts
// ── Search + filter (search seeds from ?q= set by the topbar search) ──────
const route = useRoute()
const router = useRouter()

const search = ref((route.query.q as string) ?? '')
watch(() => route.query.q, q => { search.value = (q as string) ?? '' })

const activeFilter = ref<'all' | 'enrolled' | 'withdrawn' | 'graduated'>('enrolled')

const filterTabs = computed(() =>
  (['enrolled', 'all', 'withdrawn', 'graduated'] as const)
    .map(f => ({ label: t(`children.filter.${f}`), value: f })),
)
```

- [ ] **Step 2: Open the add modal from `?add=1` (sidebar CTA)**

Add directly after the `openAdd()` function definition:

```ts
// Sidebar CTA lands here with ?add=1 — open the modal once, then strip the param.
watch(
  () => route.query.add,
  add => {
    if (add === '1' && canMutate.value && selectedKgId.value !== 'ALL') {
      openAdd()
      router.replace({ query: { ...route.query, add: undefined } })
    }
  },
  { immediate: true },
)
```

- [ ] **Step 3: Adopt `BasePageHeader`**

Replace:

```html
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-xl font-semibold text-slate-800">{{ t('children.pageTitle') }}</h1>
        <p class="mt-0.5 text-sm text-slate-400">{{ t('children.pageSubtitle') }}</p>
      </div>
      <UButton v-if="canMutate && selectedKgId !== 'ALL'" color="primary" @click="openAdd">
        <UIcon name="i-heroicons-user-plus" class="mr-1.5 h-5 w-5" />
        {{ t('children.addTitle') }}
      </UButton>
    </div>
```

with:

```html
    <!-- Header -->
    <BasePageHeader :title="t('children.pageTitle')" :subtitle="t('children.pageSubtitle')">
      <template #actions>
        <UButton v-if="canMutate && selectedKgId !== 'ALL'" color="primary" @click="openAdd">
          <UIcon name="i-heroicons-user-plus" class="mr-1.5 h-5 w-5" />
          {{ t('children.addTitle') }}
        </UButton>
      </template>
    </BasePageHeader>
```

- [ ] **Step 4: Adopt `BaseStatCard`**

Replace the three stat-card `<div>`s:

```html
    <div v-if="selectedKgId !== 'ALL'" class="grid grid-cols-3 gap-4">
      <div class="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
        <p class="text-xs font-medium uppercase tracking-widest text-slate-400">{{ t('children.filter.all') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ items.length }}</p>
      </div>
      <div class="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
        <p class="text-xs font-medium uppercase tracking-widest text-slate-400">{{ t('children.filter.enrolled') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-teal-600">{{ enrolledCount }}</p>
      </div>
      <div class="rounded-2xl border border-border bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]">
        <p class="text-xs font-medium uppercase tracking-widest text-slate-400">{{ t('children.filter.withdrawn') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ withdrawnCount }}</p>
      </div>
    </div>
```

with:

```html
    <div v-if="selectedKgId !== 'ALL'" class="grid grid-cols-3 gap-4">
      <BaseStatCard :label="t('children.filter.all')" :value="items.length" icon="i-heroicons-academic-cap" icon-class="bg-teal-50 text-teal-600" :loading="loading" />
      <BaseStatCard :label="t('children.filter.enrolled')" :value="enrolledCount" icon="i-heroicons-check-circle" icon-class="bg-teal-50 text-teal-600" :loading="loading" />
      <BaseStatCard :label="t('children.filter.withdrawn')" :value="withdrawnCount" icon="i-heroicons-arrow-right-start-on-rectangle" icon-class="bg-slate-100 text-slate-500" :loading="loading" />
    </div>
```

- [ ] **Step 5: Adopt `BaseFilterTabs`**

Replace the tab-bar block inside the table card:

```html
        <div class="flex items-center justify-between border-b border-border px-4">
          <div class="flex">
            <button
              v-for="f in (['enrolled', 'all', 'withdrawn', 'graduated'] as const)"
              :key="f"
              :class="[
                '-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                activeFilter === f
                  ? 'border-teal-600 text-teal-600'
                  : 'border-transparent text-slate-400 hover:text-slate-600',
              ]"
              @click="activeFilter = f"
            >
              {{ t(`children.filter.${f}`) }}
            </button>
          </div>
```

with:

```html
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <BaseFilterTabs v-model="activeFilter" :items="filterTabs" />
```

(The closing `</div>` after the `UInput` and the `UInput` itself stay unchanged.)

- [ ] **Step 6: Verify + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add src/modules/children/pages/ChildrenListPage.vue
git commit -m "feat(children): adopt Base components, wire topbar search + sidebar CTA params"
```

---

### Task 7: DashboardPage adoption

**Files:**
- Modify: `src/modules/dashboard/pages/DashboardPage.vue`

**Interfaces:**
- Consumes: `BasePageHeader`, `BaseStatCard` (default slot used for the attendance placeholder).

- [ ] **Step 1: Replace the page header**

Replace:

```html
    <!-- ── Page header ───────────────────────────────────────────────────── -->
    <div>
      <h1 class="text-xl font-semibold text-slate-800">{{ t('dashboard.pageTitle') }}</h1>
      <p class="mt-0.5 text-sm text-slate-400">{{ t('dashboard.pageSubtitle') }}</p>
    </div>
```

with:

```html
    <!-- ── Page header ───────────────────────────────────────────────────── -->
    <BasePageHeader :title="t('dashboard.pageTitle')" :subtitle="t('dashboard.pageSubtitle')" />
```

- [ ] **Step 2: Replace the four stat cards**

Replace the whole "Row 1: Stat cards" grid (the four `rounded-2xl` card `<div>`s, from `<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">` through its closing `</div>`) with:

```html
    <!-- ── Row 1: Stat cards ─────────────────────────────────────────────── -->
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <BaseStatCard
        :label="t('dashboard.stats.children')"
        :value="stats?.totalChildren ?? 0"
        icon="i-heroicons-academic-cap"
        icon-class="bg-teal-50 text-teal-600"
        :loading="loading"
      />
      <BaseStatCard
        :label="t('dashboard.stats.groups')"
        :value="stats?.totalGroups ?? 0"
        icon="i-heroicons-user-group"
        icon-class="bg-brand-sage/20 text-teal-600"
        :loading="loading"
      />
      <BaseStatCard
        :label="t('dashboard.stats.staff')"
        :value="stats?.activeStaff ?? 0"
        icon="i-heroicons-users"
        icon-class="bg-slate-100 text-slate-500"
        :loading="loading"
      />
      <BaseStatCard
        :label="t('dashboard.stats.attendance')"
        icon="i-heroicons-chart-bar"
        icon-class="bg-slate-100 text-slate-300"
      >
        <span class="text-sm font-medium text-slate-300">{{ t('dashboard.attendanceComingSoon') }}</span>
      </BaseStatCard>
    </div>
```

- [ ] **Step 3: Verify + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add src/modules/dashboard/pages/DashboardPage.vue
git commit -m "refactor(dashboard): adopt BasePageHeader + BaseStatCard"
```

---

### Task 8: GroupsListPage adoption

**Files:**
- Modify: `src/modules/groups/pages/GroupsListPage.vue`

**Interfaces:**
- Consumes: `BasePageHeader`, `BaseStatCard`, `BaseFilterTabs`.

- [ ] **Step 1: Add the tabs items computed to the script**

After the `filteredItems` computed, add:

```ts
const filterTabs = computed(() =>
  (['active', 'all', 'archived'] as const)
    .map(f => ({ label: t(`groups.filter.${f}`), value: f })),
)
```

- [ ] **Step 2: Replace the page header**

Replace:

```html
    <!-- Page header -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-xl font-semibold text-slate-800">{{ t('groups.pageTitle') }}</h1>
        <p class="mt-0.5 text-sm text-slate-400">{{ t('groups.pageSubtitle') }}</p>
      </div>
      <UButton v-if="canMutate && selectedKgId !== 'ALL'" color="primary" @click="openCreate">
        <UIcon name="i-heroicons-plus" class="mr-1.5 h-5 w-5" />
        {{ t('groups.createTitle') }}
      </UButton>
    </div>
```

with:

```html
    <!-- Page header -->
    <BasePageHeader :title="t('groups.pageTitle')" :subtitle="t('groups.pageSubtitle')">
      <template #actions>
        <UButton v-if="canMutate && selectedKgId !== 'ALL'" color="primary" @click="openCreate">
          <UIcon name="i-heroicons-plus" class="mr-1.5 h-5 w-5" />
          {{ t('groups.createTitle') }}
        </UButton>
      </template>
    </BasePageHeader>
```

- [ ] **Step 3: Replace the four stat cards**

Replace the "Stats bar" grid (four card `<div>`s) with:

```html
    <!-- Stats bar -->
    <div v-if="selectedKgId !== 'ALL'" class="grid grid-cols-4 gap-4">
      <BaseStatCard :label="t('groups.stats.totalGroups')" :value="activeItems.length" icon="i-heroicons-user-group" icon-class="bg-teal-50 text-teal-600" :loading="loading" />
      <BaseStatCard :label="t('groups.stats.totalEnrollment')" :value="totalEnrolled" icon="i-heroicons-face-smile" icon-class="bg-brand-yellow/20 text-brand-gold" :loading="loading" />
      <BaseStatCard :label="t('groups.stats.educators')" :value="educatorsCount" icon="i-heroicons-identification" icon-class="bg-brand-sage/20 text-teal-600" :loading="loading" />
      <BaseStatCard :label="t('groups.stats.totalCapacity')" :value="totalCapacity ?? '—'" icon="i-heroicons-chart-pie" icon-class="bg-slate-100 text-slate-500" :loading="loading" />
    </div>
```

- [ ] **Step 4: Replace the filter tabs**

Replace:

```html
      <!-- Filter tabs -->
      <div class="flex gap-1 border-b border-border">
        <button
          v-for="f in (['active', 'all', 'archived'] as const)"
          :key="f"
          :class="[
            '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
            activeFilter === f
              ? 'border-teal-600 text-teal-600'
              : 'border-transparent text-slate-400 hover:text-slate-600',
          ]"
          @click="activeFilter = f"
        >
          {{ t(`groups.filter.${f}`) }}
        </button>
      </div>
```

with:

```html
      <!-- Filter tabs -->
      <BaseFilterTabs v-model="activeFilter" :items="filterTabs" />
```

- [ ] **Step 5: Verify + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add src/modules/groups/pages/GroupsListPage.vue
git commit -m "refactor(groups): adopt BasePageHeader, BaseStatCard, BaseFilterTabs"
```

---

### Task 9: StaffListPage adoption (fixes the stale card style)

**Files:**
- Modify: `src/modules/staff/pages/StaffListPage.vue`

**Interfaces:**
- Consumes: `BasePageHeader`, `BaseStatCard`, `BaseFilterTabs`.

Note: this page still uses the old `rounded-xl`/no-shadow cards — adopting `BaseStatCard` upgrades it to the standard style. The staff mockup's stat cards have no icon bubbles, so pass no `icon`.

- [ ] **Step 1: Add the tabs items computed to the script**

Next to the existing `activeFilter` ref (`'all' | 'educators' | 'admins'`), add:

```ts
const filterTabs = computed(() =>
  (['all', 'educators', 'admins'] as const)
    .map(f => ({ label: t(`staff.filter.${f}`), value: f })),
)
```

(Ensure `computed` is already imported from `vue` — it is.)

- [ ] **Step 2: Replace the page header**

Replace:

```html
    <!-- Page header -->
    <div class="flex items-start justify-between">
      <div>
        <h1 class="text-xl font-semibold text-slate-800">{{ t('staff.pageTitle') }}</h1>
        <p class="mt-0.5 text-sm text-slate-400">{{ t('staff.pageSubtitle') }}</p>
      </div>
      <UButton
        v-if="can('create', 'staff') && selectedKgId !== 'ALL'"
        color="primary"
        @click="openInvite"
      >
        <UIcon name="i-heroicons-user-plus" class="mr-1.5 h-5 w-5" />
        {{ t('staff.invite') }}
      </UButton>
    </div>
```

with:

```html
    <!-- Page header -->
    <BasePageHeader :title="t('staff.pageTitle')" :subtitle="t('staff.pageSubtitle')">
      <template #actions>
        <UButton
          v-if="can('create', 'staff') && selectedKgId !== 'ALL'"
          color="primary"
          @click="openInvite"
        >
          <UIcon name="i-heroicons-user-plus" class="mr-1.5 h-5 w-5" />
          {{ t('staff.invite') }}
        </UButton>
      </template>
    </BasePageHeader>
```

- [ ] **Step 3: Replace the four stat cards**

Replace:

```html
    <div v-if="selectedKgId !== 'ALL'" class="grid grid-cols-4 gap-4">
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('staff.stats.total') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ totalStaff }}</p>
      </div>
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('staff.stats.active') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-teal-600">{{ activeStaff }}</p>
      </div>
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('staff.stats.inactive') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ inactiveStaff }}</p>
      </div>
      <div class="rounded-xl border border-border bg-white p-5">
        <p class="text-xs font-medium uppercase tracking-wide text-slate-400">{{ t('staff.stats.admins') }}</p>
        <p class="mt-2 text-3xl font-semibold tabular-nums text-slate-800">{{ adminCount }}</p>
      </div>
    </div>
```

with:

```html
    <div v-if="selectedKgId !== 'ALL'" class="grid grid-cols-4 gap-4">
      <BaseStatCard :label="t('staff.stats.total')" :value="totalStaff" />
      <BaseStatCard :label="t('staff.stats.active')" :value="activeStaff" />
      <BaseStatCard :label="t('staff.stats.inactive')" :value="inactiveStaff" />
      <BaseStatCard :label="t('staff.stats.admins')" :value="adminCount" />
    </div>
```

- [ ] **Step 4: Replace the tab bar**

Replace the underline tab bar inside the table card:

```html
        <!-- Tabs -->
        <div class="flex border-b border-border px-4">
          <button
            v-for="f in (['all', 'educators', 'admins'] as const)"
            :key="f"
            :class="[
              '-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              activeFilter === f
                ? 'border-teal-600 text-teal-600'
                : 'border-transparent text-slate-400 hover:text-slate-600',
            ]"
            @click="activeFilter = f"
          >
            {{ t(`staff.filter.${f}`) }}
          </button>
        </div>
```

with:

```html
        <!-- Tabs -->
        <div class="border-b border-border px-4 py-3">
          <BaseFilterTabs v-model="activeFilter" :items="filterTabs" />
        </div>
```

Also change the table card's wrapper `<div class="rounded-xl border border-border bg-white">` to `<div class="rounded-2xl border border-border bg-white shadow-[0_1px_3px_rgba(16,24,40,0.04)]">` so the whole page matches the standard card style.

- [ ] **Step 5: Verify + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add src/modules/staff/pages/StaffListPage.vue
git commit -m "refactor(staff): adopt Base components, upgrade to standard card style"
```

---

### Task 10: KindergartensListPage + SettingsPage headers

**Files:**
- Modify: `src/modules/kindergartens/pages/KindergartensListPage.vue`
- Modify: `src/modules/settings/pages/SettingsPage.vue`

**Interfaces:**
- Consumes: `BasePageHeader`.

- [ ] **Step 1: KindergartensListPage header**

The current header wraps the create-modal trigger; move the whole existing `<UModal>` block (unchanged, including all its `#header`/`#body` content) into the `#actions` slot. Replace the wrapper:

```html
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-xl font-semibold text-neutral-800">{{ t('kindergartens.pageTitle') }}</h1>
      <UModal v-if="can('create', 'kindergarten')" v-model:open="createModalOpen">
```

with:

```html
    <BasePageHeader :title="t('kindergartens.pageTitle')" class="mb-6">
      <template #actions>
        <UModal v-if="can('create', 'kindergarten')" v-model:open="createModalOpen">
```

…and at the end of that same `<UModal>` block, replace its closing lines:

```html
      </UModal>
    </div>
```

with:

```html
        </UModal>
      </template>
    </BasePageHeader>
```

(Everything between the `<UModal …>` opening tag and `</UModal>` stays byte-identical — only indentation may shift.)

- [ ] **Step 2: SettingsPage header**

Replace:

```html
    <!-- Page header -->
    <div>
      <h1 class="text-xl font-semibold text-slate-800">{{ t('settings.pageTitle') }}</h1>
      <p class="mt-0.5 text-sm text-slate-400">{{ t('settings.pageSubtitle') }}</p>
    </div>
```

with:

```html
    <!-- Page header -->
    <BasePageHeader :title="t('settings.pageTitle')" :subtitle="t('settings.pageSubtitle')" />
```

- [ ] **Step 3: Verify + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add src/modules/kindergartens/pages/KindergartensListPage.vue src/modules/settings/pages/SettingsPage.vue
git commit -m "refactor(kindergartens,settings): adopt BasePageHeader"
```

---

### Task 11: Final verification + audit status note

**Files:**
- Modify: `docs/Startica_Audit_2026-07-02_UI.md` (status note at top)

- [ ] **Step 1: Full suite**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass. If anything fails, fix before proceeding — do not commit failing state.

- [ ] **Step 2: Add a status note to the audit doc**

In `docs/Startica_Audit_2026-07-02_UI.md`, directly under the `**Method:** …` line, add:

```markdown
**Status update:** UI-0, UI-1, and UI-2 implemented on `fix/security-and-quality` (see `docs/superpowers/plans/2026-07-02-ui-design-alignment.md`). UI-3 (children pagination/kebab/filters) and the live screenshot-compare loop remain open.
```

- [ ] **Step 3: Commit**

```bash
git add docs/Startica_Audit_2026-07-02_UI.md
git commit -m "docs(audit): mark UI-0/1/2 implemented"
```

- [ ] **Step 4: Report**

Summarize to the user: what changed, that lint/typecheck/tests pass, and that the visual screenshot-compare loop against the mockups still needs Docker (local Supabase) to run the app.
