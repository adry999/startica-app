# Children Directory UI-3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the four UI-3 gaps on the children directory (`ChildrenListPage.vue`) from `docs/Startica_Audit_2026-07-02_UI.md`: pagination, a kebab row-actions menu, Group + Age Range filters, and moving the stat cards below the table — per the approved spec `docs/superpowers/specs/2026-07-02-children-directory-ui3-design.md`.

**Architecture:** Pure front-end additions to a single page — no service/store/schema changes. A new reusable `BasePagination` (`src/shared/ui/`) wraps Nuxt UI's `UPagination` plus a slot-driven summary line. `ChildrenListPage.vue` gains a kebab menu (Nuxt UI `UDropdownMenu`), two new filter refs (group, age bucket) folded into the existing `filteredItems` computed, and client-side pagination (`.slice()`) over that filtered list.

**Tech Stack:** Nuxt 3 (srcDir `src/`), Nuxt UI v3 (`UPagination`, `UDropdownMenu`, `USelect`), Vitest 4 + @vue/test-utils + happy-dom (component tests), vue-i18n via @nuxtjs/i18n.

## Global Constraints

- **No hardcoded user-facing strings** — every string through i18n keys, in BOTH `src/core/i18n/locales/ro.json` and `en.json` (RO is default).
- **`shared/ui` has zero business logic** — `BasePagination` takes props in, emits events out; no store/service/composable imports.
- **No new service/store/schema changes** — the page already fetches the full per-kindergarten roster; pagination and filters are computed client-side over `items.value`.
- **Commit format:** `type(scope): message` (repo convention).
- **Verification commands:** `npm run lint`, `npm run typecheck`, `npm run test` — all must pass at the end of every task that changes code.

---

### Task 1: `BasePagination` shared component

**Files:**
- Create: `src/shared/ui/BasePagination.vue`
- Test: `src/shared/ui/BasePagination.test.ts`

**Interfaces:**
- Produces: `BasePagination` — props `{ page: number; pageSize: number; total: number }`, emits `update:page` (number), scoped slot `summary: { from: number; to: number; total: number }`. Auto-imported via the existing `~/shared/ui` components dir (no import statement needed in `.vue` pages). Renders no pager control when `total <= pageSize`.

- [ ] **Step 1: Write the failing test — `src/shared/ui/BasePagination.test.ts`**

```ts
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import BasePagination from './BasePagination.vue'

// Stand-in for Nuxt UI's UPagination — mirrors only the public contract
// (`page`, `items-per-page`, `total` props; `update:page` emit) BasePagination
// relies on, so the test doesn't depend on Nuxt UI's internal rendering.
const UPaginationStub = defineComponent({
  props: {
    page: { type: Number, required: true },
    itemsPerPage: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  emits: ['update:page'],
  setup(props, { emit }) {
    return () => h('button', { class: 'pager-next', onClick: () => emit('update:page', props.page + 1) }, 'next')
  },
})

const mountOptions = { global: { stubs: { UPagination: UPaginationStub } } }

describe('BasePagination', () => {
  it('renders the summary slot with computed from/to/total', () => {
    const wrapper = mount(BasePagination, {
      props: { page: 2, pageSize: 10, total: 25 },
      slots: { summary: (p: { from: number; to: number; total: number }) => `Showing ${p.from}-${p.to} of ${p.total}` },
      ...mountOptions,
    })
    expect(wrapper.text()).toContain('Showing 11-20 of 25')
  })

  it('hides the pager when total fits on one page', () => {
    const wrapper = mount(BasePagination, {
      props: { page: 1, pageSize: 10, total: 5 },
      slots: { summary: () => 'Showing 1-5 of 5' },
      ...mountOptions,
    })
    expect(wrapper.find('.pager-next').exists()).toBe(false)
  })

  it('emits update:page when the pager changes page', async () => {
    const wrapper = mount(BasePagination, {
      props: { page: 1, pageSize: 10, total: 25 },
      slots: { summary: () => 'Showing 1-10 of 25' },
      ...mountOptions,
    })
    await wrapper.find('.pager-next').trigger('click')
    expect(wrapper.emitted('update:page')).toEqual([[2]])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/ui/BasePagination.test.ts`
Expected: FAIL — cannot resolve `./BasePagination.vue`.

- [ ] **Step 3: Implement `src/shared/ui/BasePagination.vue`**

```vue
<script setup lang="ts">
defineProps<{
  page: number
  pageSize: number
  total: number
}>()

defineEmits<{
  (e: 'update:page', value: number): void
}>()
</script>

<template>
  <div class="flex items-center justify-between px-6 py-4">
    <p class="text-sm text-slate-500">
      <slot
        name="summary"
        :from="total === 0 ? 0 : (page - 1) * pageSize + 1"
        :to="Math.min(page * pageSize, total)"
        :total="total"
      />
    </p>
    <UPagination
      v-if="total > pageSize"
      :page="page"
      :items-per-page="pageSize"
      :total="total"
      @update:page="$emit('update:page', $event)"
    />
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/ui/BasePagination.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add src/shared/ui/BasePagination.vue src/shared/ui/BasePagination.test.ts
git commit -m "feat(ui): add BasePagination shared component"
```

---

### Task 2: Kebab row-actions menu

**Files:**
- Modify: `src/modules/children/pages/ChildrenListPage.vue`

**Interfaces:**
- Consumes: existing `openEdit(child)`, `openStatus(child)`, `canMutate` (computed), `navigateTo` (Nuxt auto-import).
- Produces: no new exports — this task only changes the `actions` column's cell renderer.

- [ ] **Step 1: Resolve `UDropdownMenu` alongside the other resolved components**

Replace:

```ts
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const BaseAvatar = resolveComponent('BaseAvatar')
```

with:

```ts
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const BaseAvatar = resolveComponent('BaseAvatar')
const UDropdownMenu = resolveComponent('UDropdownMenu')
```

- [ ] **Step 2: Replace the `actions` column cell**

Replace:

```ts
  {
    id: 'actions',
    header: t('children.table.actions'),
    cell: ({ row }) =>
      h('div', { class: 'flex gap-1' }, [
        canMutate.value
          ? h(UButton, { size: 'xs', color: 'neutral', variant: 'ghost', onClick: () => openEdit(row.original) }, () => t('common.edit'))
          : null,
        canMutate.value
          ? h(UButton, { size: 'xs', color: 'neutral', variant: 'ghost', onClick: () => openStatus(row.original) }, () => t('children.setStatus'))
          : null,
      ]),
  },
```

with:

```ts
  {
    id: 'actions',
    header: t('children.table.actions'),
    cell: ({ row }) => {
      const items = [
        { label: t('children.viewProfile'), icon: 'i-heroicons-user', onSelect: () => navigateTo(`/children/${row.original.id}`) },
        canMutate.value ? { label: t('common.edit'), icon: 'i-heroicons-pencil-square', onSelect: () => openEdit(row.original) } : null,
        canMutate.value ? { label: t('children.setStatus'), icon: 'i-heroicons-arrow-path', onSelect: () => openStatus(row.original) } : null,
      ].filter((item): item is { label: string; icon: string; onSelect: () => void } => item !== null)
      return h(UDropdownMenu, { items }, {
        default: () => h(UButton, {
          icon: 'i-heroicons-ellipsis-vertical',
          size: 'xs',
          color: 'neutral',
          variant: 'ghost',
          'aria-label': t('children.table.actions'),
        }),
      })
    },
  },
```

- [ ] **Step 3: Add the `viewProfile` i18n key**

In `src/core/i18n/locales/en.json`, in the `children` object, replace:

```json
    "setStatus": "Change status",
```

with:

```json
    "setStatus": "Change status",
    "viewProfile": "View profile",
```

In `src/core/i18n/locales/ro.json`, in the `children` object, replace:

```json
    "setStatus": "Schimbă status",
```

with:

```json
    "setStatus": "Schimbă status",
    "viewProfile": "Vezi profilul",
```

- [ ] **Step 4: Verify + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add src/modules/children/pages/ChildrenListPage.vue src/core/i18n/locales/en.json src/core/i18n/locales/ro.json
git commit -m "feat(children): replace row action buttons with kebab menu"
```

---

### Task 3: Group + Age Range filters

**Files:**
- Modify: `src/modules/children/pages/ChildrenListPage.vue`
- Modify: `src/core/i18n/locales/ro.json`, `src/core/i18n/locales/en.json`

**Interfaces:**
- Consumes: `groupsStore.items` (already fetched on this page for the add/edit modals), `Child.groupId`, `Child.age`.
- Produces: `groupFilter` ref (`'all' | 'none' | string`), `ageBucket` ref (`'all' | 'under1' | 'oneToThree' | 'threeToFive' | 'fivePlus'`) — both consumed by Task 4's pagination-reset watcher.

- [ ] **Step 1: Add the two filter refs next to `activeFilter`**

Replace:

```ts
const activeFilter = ref<'all' | 'enrolled' | 'withdrawn' | 'graduated'>('enrolled')

const filterTabs = computed(() =>
  (['enrolled', 'all', 'withdrawn', 'graduated'] as const)
    .map(f => ({ label: t(`children.filter.${f}`), value: f })),
)
```

with:

```ts
const activeFilter = ref<'all' | 'enrolled' | 'withdrawn' | 'graduated'>('enrolled')
const groupFilter = ref<'all' | 'none' | string>('all')
const ageBucket = ref<'all' | 'under1' | 'oneToThree' | 'threeToFive' | 'fivePlus'>('all')

const filterTabs = computed(() =>
  (['enrolled', 'all', 'withdrawn', 'graduated'] as const)
    .map(f => ({ label: t(`children.filter.${f}`), value: f })),
)

const groupFilterOptions = computed(() => [
  { label: t('children.groupFilter.all'), value: 'all' },
  { label: t('children.noGroup'), value: 'none' },
  ...groupsStore.items
    .filter(g => g.status === 'active')
    .map(g => ({ label: g.name, value: g.id })),
])

const ageFilterOptions = computed(() =>
  (['all', 'under1', 'oneToThree', 'threeToFive', 'fivePlus'] as const)
    .map(b => ({ label: t(`children.ageFilter.${b}`), value: b })),
)

function matchesAgeBucket(age: number, bucket: 'all' | 'under1' | 'oneToThree' | 'threeToFive' | 'fivePlus'): boolean {
  if (bucket === 'all') return true
  if (bucket === 'under1') return age === 0
  if (bucket === 'oneToThree') return age === 1 || age === 2
  if (bucket === 'threeToFive') return age === 3 || age === 4
  return age >= 5 // 'fivePlus'
}
```

- [ ] **Step 2: Apply both filters in `filteredItems`**

Replace:

```ts
const filteredItems = computed(() => {
  let list = items.value
  if (activeFilter.value !== 'all') list = list.filter(c => c.status === activeFilter.value)
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(c => c.fullName.toLowerCase().includes(q))
  }
  return list
})
```

with:

```ts
const filteredItems = computed(() => {
  let list = items.value
  if (activeFilter.value !== 'all') list = list.filter(c => c.status === activeFilter.value)
  if (groupFilter.value === 'none') list = list.filter(c => c.groupId === null)
  else if (groupFilter.value !== 'all') list = list.filter(c => c.groupId === groupFilter.value)
  if (ageBucket.value !== 'all') list = list.filter(c => matchesAgeBucket(c.age, ageBucket.value))
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(c => c.fullName.toLowerCase().includes(q))
  }
  return list
})
```

- [ ] **Step 3: Add the two `USelect`s to the filter row template**

Replace:

```html
        <!-- Search + tabs -->
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <BaseFilterTabs v-model="activeFilter" :items="filterTabs" />
          <UInput v-model="search" :placeholder="t('common.search')" size="sm" class="w-52">
            <template #leading>
              <UIcon name="i-heroicons-magnifying-glass" class="h-4 w-4 text-slate-400" />
            </template>
          </UInput>
        </div>
```

with:

```html
        <!-- Search + tabs + filters -->
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <BaseFilterTabs v-model="activeFilter" :items="filterTabs" />
          <div class="flex flex-wrap items-center gap-2">
            <USelect
              v-model="groupFilter"
              :items="groupFilterOptions"
              :aria-label="t('children.groupFilter.label')"
              size="sm"
              class="w-40"
            />
            <USelect
              v-model="ageBucket"
              :items="ageFilterOptions"
              :aria-label="t('children.ageFilter.label')"
              size="sm"
              class="w-40"
            />
            <UInput v-model="search" :placeholder="t('common.search')" size="sm" class="w-52">
              <template #leading>
                <UIcon name="i-heroicons-magnifying-glass" class="h-4 w-4 text-slate-400" />
              </template>
            </UInput>
          </div>
        </div>
```

- [ ] **Step 4: Add the i18n keys**

In `src/core/i18n/locales/en.json`, in the `children` object, replace:

```json
    "filter": {
      "all": "All",
      "enrolled": "Enrolled",
      "withdrawn": "Withdrawn",
      "graduated": "Graduated"
    },
```

with:

```json
    "filter": {
      "all": "All",
      "enrolled": "Enrolled",
      "withdrawn": "Withdrawn",
      "graduated": "Graduated"
    },
    "groupFilter": {
      "label": "Group",
      "all": "All Groups"
    },
    "ageFilter": {
      "label": "Age Range",
      "all": "All Ages",
      "under1": "0–12 Months",
      "oneToThree": "1–3 Years",
      "threeToFive": "3–5 Years",
      "fivePlus": "5+ Years"
    },
```

In `src/core/i18n/locales/ro.json`, in the `children` object, replace:

```json
    "filter": {
      "all": "Toți",
      "enrolled": "Înscriși",
      "withdrawn": "Retrași",
      "graduated": "Absolvenți"
    },
```

with:

```json
    "filter": {
      "all": "Toți",
      "enrolled": "Înscriși",
      "withdrawn": "Retrași",
      "graduated": "Absolvenți"
    },
    "groupFilter": {
      "label": "Grupă",
      "all": "Toate grupele"
    },
    "ageFilter": {
      "label": "Interval de vârstă",
      "all": "Toate vârstele",
      "under1": "0–12 luni",
      "oneToThree": "1–3 ani",
      "threeToFive": "3–5 ani",
      "fivePlus": "Peste 5 ani"
    },
```

- [ ] **Step 5: Verify + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add src/modules/children/pages/ChildrenListPage.vue src/core/i18n/locales/en.json src/core/i18n/locales/ro.json
git commit -m "feat(children): add Group and Age Range filters"
```

---

### Task 4: Pagination wiring

**Files:**
- Modify: `src/modules/children/pages/ChildrenListPage.vue`
- Modify: `src/core/i18n/locales/ro.json`, `src/core/i18n/locales/en.json`

**Interfaces:**
- Consumes: `BasePagination { page, pageSize, total, #summary }` (Task 1), `filteredItems`, `activeFilter`/`groupFilter`/`ageBucket`/`search` refs (Task 3).
- Produces: `page` ref, `pageSize` constant, `pagedItems` computed — `pagedItems` becomes the `UTable`'s data source.

- [ ] **Step 1: Add pagination state after `filteredItems`**

Replace:

```ts
const filteredItems = computed(() => {
  let list = items.value
  if (activeFilter.value !== 'all') list = list.filter(c => c.status === activeFilter.value)
  if (groupFilter.value === 'none') list = list.filter(c => c.groupId === null)
  else if (groupFilter.value !== 'all') list = list.filter(c => c.groupId === groupFilter.value)
  if (ageBucket.value !== 'all') list = list.filter(c => matchesAgeBucket(c.age, ageBucket.value))
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(c => c.fullName.toLowerCase().includes(q))
  }
  return list
})
```

with:

```ts
const filteredItems = computed(() => {
  let list = items.value
  if (activeFilter.value !== 'all') list = list.filter(c => c.status === activeFilter.value)
  if (groupFilter.value === 'none') list = list.filter(c => c.groupId === null)
  else if (groupFilter.value !== 'all') list = list.filter(c => c.groupId === groupFilter.value)
  if (ageBucket.value !== 'all') list = list.filter(c => matchesAgeBucket(c.age, ageBucket.value))
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(c => c.fullName.toLowerCase().includes(q))
  }
  return list
})

// ── Pagination ─────────────────────────────────────────────────────────────
const page = ref(1)
const pageSize = 10

const pagedItems = computed(() =>
  filteredItems.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)

watch([activeFilter, search, groupFilter, ageBucket], () => { page.value = 1 })
```

- [ ] **Step 2: Point the table at `pagedItems` and add `BasePagination` below it**

Replace:

```html
        <UTable :data="filteredItems" :columns="columns" :loading="loading">
          <template #empty>
            <p class="py-10 text-center text-sm text-slate-400">{{ t('children.empty') }}</p>
          </template>
        </UTable>
      </div>
    </template>
```

with:

```html
        <UTable :data="pagedItems" :columns="columns" :loading="loading">
          <template #empty>
            <p class="py-10 text-center text-sm text-slate-400">{{ t('children.empty') }}</p>
          </template>
        </UTable>

        <BasePagination v-model:page="page" :page-size="pageSize" :total="filteredItems.length">
          <template #summary="{ from, to, total }">
            {{ t('children.pagination.showing', { from, to, total }) }}
          </template>
        </BasePagination>
      </div>
    </template>
```

- [ ] **Step 3: Add the `pagination.showing` i18n key**

In `src/core/i18n/locales/en.json`, in the `children` object, replace:

```json
    "ageFilter": {
      "label": "Age Range",
      "all": "All Ages",
      "under1": "0–12 Months",
      "oneToThree": "1–3 Years",
      "threeToFive": "3–5 Years",
      "fivePlus": "5+ Years"
    },
```

with:

```json
    "ageFilter": {
      "label": "Age Range",
      "all": "All Ages",
      "under1": "0–12 Months",
      "oneToThree": "1–3 Years",
      "threeToFive": "3–5 Years",
      "fivePlus": "5+ Years"
    },
    "pagination": {
      "showing": "Showing {from}–{to} of {total} children"
    },
```

In `src/core/i18n/locales/ro.json`, in the `children` object, replace:

```json
    "ageFilter": {
      "label": "Interval de vârstă",
      "all": "Toate vârstele",
      "under1": "0–12 luni",
      "oneToThree": "1–3 ani",
      "threeToFive": "3–5 ani",
      "fivePlus": "Peste 5 ani"
    },
```

with:

```json
    "ageFilter": {
      "label": "Interval de vârstă",
      "all": "Toate vârstele",
      "under1": "0–12 luni",
      "oneToThree": "1–3 ani",
      "threeToFive": "3–5 ani",
      "fivePlus": "Peste 5 ani"
    },
    "pagination": {
      "showing": "Se afișează {from}–{to} din {total} copii"
    },
```

- [ ] **Step 4: Verify + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add src/modules/children/pages/ChildrenListPage.vue src/core/i18n/locales/en.json src/core/i18n/locales/ro.json
git commit -m "feat(children): add client-side pagination"
```

---

### Task 5: Move stat cards below the table

**Files:**
- Modify: `src/modules/children/pages/ChildrenListPage.vue`

**Interfaces:**
- Consumes: existing `enrolledCount`, `withdrawnCount`, `items`, `loading` — no changes to their definitions, only to where the markup that uses them sits in the template.

- [ ] **Step 1: Remove the stat cards from their current position (above the table)**

Replace:

```html
    <!-- Fetch error -->
    <UAlert v-if="error" color="error" variant="soft" :description="error" class="mb-4" />

    <!-- Stat cards -->
    <div v-if="selectedKgId !== 'ALL'" class="grid grid-cols-3 gap-4">
      <BaseStatCard :label="t('children.filter.all')" :value="items.length" icon="i-heroicons-academic-cap" icon-class="bg-teal-50 text-teal-600" :loading="loading" />
      <BaseStatCard :label="t('children.filter.enrolled')" :value="enrolledCount" icon="i-heroicons-check-circle" icon-class="bg-teal-50 text-teal-600" :loading="loading" />
      <BaseStatCard :label="t('children.filter.withdrawn')" :value="withdrawnCount" icon="i-heroicons-arrow-right-start-on-rectangle" icon-class="bg-slate-100 text-slate-500" :loading="loading" />
    </div>

    <p v-if="selectedKgId === 'ALL'" class="text-sm text-slate-400">{{ t('staff.selectKindergarten') }}</p>
```

with:

```html
    <!-- Fetch error -->
    <UAlert v-if="error" color="error" variant="soft" :description="error" class="mb-4" />

    <p v-if="selectedKgId === 'ALL'" class="text-sm text-slate-400">{{ t('staff.selectKindergarten') }}</p>
```

- [ ] **Step 2: Add the stat cards below the table card, inside the same `v-else` block**

Replace:

```html
        <BasePagination v-model:page="page" :page-size="pageSize" :total="filteredItems.length">
          <template #summary="{ from, to, total }">
            {{ t('children.pagination.showing', { from, to, total }) }}
          </template>
        </BasePagination>
      </div>
    </template>
```

with:

```html
        <BasePagination v-model:page="page" :page-size="pageSize" :total="filteredItems.length">
          <template #summary="{ from, to, total }">
            {{ t('children.pagination.showing', { from, to, total }) }}
          </template>
        </BasePagination>
      </div>

      <!-- Stat cards -->
      <div class="grid grid-cols-3 gap-4">
        <BaseStatCard :label="t('children.filter.all')" :value="items.length" icon="i-heroicons-academic-cap" icon-class="bg-teal-50 text-teal-600" :loading="loading" />
        <BaseStatCard :label="t('children.filter.enrolled')" :value="enrolledCount" icon="i-heroicons-check-circle" icon-class="bg-teal-50 text-teal-600" :loading="loading" />
        <BaseStatCard :label="t('children.filter.withdrawn')" :value="withdrawnCount" icon="i-heroicons-arrow-right-start-on-rectangle" icon-class="bg-slate-100 text-slate-500" :loading="loading" />
      </div>
    </template>
```

- [ ] **Step 3: Verify + commit**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass.

```bash
git add src/modules/children/pages/ChildrenListPage.vue
git commit -m "refactor(children): move stat cards below the table"
```

---

### Task 6: Final verification + audit status note

**Files:**
- Modify: `docs/Startica_Audit_2026-07-02_UI.md`

- [ ] **Step 1: Full suite**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: all pass. If anything fails, fix before proceeding — do not commit failing state.

- [ ] **Step 2: Update the status note**

Replace:

```markdown
**Status update:** UI-0, UI-1, and UI-2 implemented on `fix/security-and-quality` (see `docs/superpowers/plans/2026-07-02-ui-design-alignment.md`). UI-3 (children pagination/kebab/filters) and the live screenshot-compare loop remain open.
```

with:

```markdown
**Status update:** UI-0, UI-1, UI-2, and UI-3 implemented on `fix/security-and-quality` (see `docs/superpowers/plans/2026-07-02-ui-design-alignment.md` and `docs/superpowers/plans/2026-07-02-children-directory-ui3.md`). The live screenshot-compare loop remains open (needs Docker/local Supabase running).
```

- [ ] **Step 3: Commit**

```bash
git add docs/Startica_Audit_2026-07-02_UI.md
git commit -m "docs(audit): mark UI-3 implemented"
```

- [ ] **Step 4: Report**

Summarize to the user: what changed (BasePagination component, kebab menu, group/age filters, pagination, stat card reposition), confirm lint/typecheck/tests pass, and note the live screenshot-compare loop against the mockups is still the only open item from the UI audits — it needs Docker (local Supabase) to run the app.
