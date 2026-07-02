# Children Directory — UI-3 Design Spec

**Date:** 2026-07-02
**Source audit:** `docs/Startica_Audit_2026-07-02_UI.md`, section "UI-3 — Per-page gaps vs. mockups" → Children directory
**Reference mockup:** `design/mockups/children_directory_final/{code.html,screen.png}`
**Scope (user-approved):** `src/modules/children/pages/ChildrenListPage.vue` only. No service/store/schema changes — the page already fetches the full per-kindergarten roster client-side and filters/searches it in the component; pagination, the kebab menu, and the two new filters are all pure presentational additions over that existing data.

**Explicitly out of scope:**
- Bulk-select checkboxes (mockup shows a checkbox column, but no bulk action exists to wire it to — building it now would be dead UI)
- Trend-line data on stat cards (mockup shows "+4 this month"; we don't currently surface a query for it, and inventing the number would be worse than omitting it)
- Server-side paged queries (roster sizes are small per kindergarten in V1; revisit if that stops being true)

---

## 1. Pagination

**New shared component: `src/shared/ui/BasePagination.vue`**

Zero business logic, follows the same pattern as `BasePageHeader`/`BaseStatCard`/`BaseFilterTabs`.

- Props: `{ page: number; pageSize: number; total: number }`
- Emits: `update:page` (number)
- Slot: `summary` — scoped `{ from: number; to: number; total: number }`. The caller composes the translated "Showing X–Y of Z" string via i18n; the component itself owns no strings.
- Wraps Nuxt UI's `UPagination` (`v-model:page`, `:total`, `:items-per-page="pageSize"`) rather than hand-rolling page-number math.
- When `total <= pageSize`, render only the `summary` slot — no pager controls (nothing to page through).

**`ChildrenListPage.vue` wiring:**

```ts
const page = ref(1)
const pageSize = 10

const pagedItems = computed(() =>
  filteredItems.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)

watch([activeFilter, search, groupFilter, ageBucket], () => { page.value = 1 })
```

- `UTable` binds to `pagedItems` instead of `filteredItems`.
- `BasePagination` sits below the table, inside the same card, bound to `:total="filteredItems.length"` (the *filtered* count, so the summary text is always consistent with what's visibly filterable) — `v-model:page="page"` `:page-size="pageSize"`.
- Resetting `page` to 1 on any filter/search change prevents landing on an empty out-of-range page.

---

## 2. Kebab row menu

Replaces the two inline `UButton`s in the `actions` column with a single `UDropdownMenu`, trigger = ghost icon button (`i-heroicons-ellipsis-vertical`), matching the mockup's `more_vert` affordance.

Menu items (in order):
1. **View profile** — `navigateTo(`/children/${row.original.id}`)`
2. **Edit** — calls existing `openEdit(row.original)`
3. **Set status** — calls existing `openStatus(row.original)`

No new component — `UDropdownMenu` is used directly (same convention as `UButton`/`UBadge` elsewhere in this file; a wrapper would add no value over Nuxt UI's own component).

---

## 3. Group + Age Range filters

Two new `USelect`s added to the table card's filter row, alongside the existing `BaseFilterTabs` (status) and search input.

**Group filter** — `groupFilter = ref<'all' | 'none' | string>('all')`
- Options: All Groups (`'all'`) + No group (`'none'`) + each active group from `groupsStore.items` (already fetched on this page for the add/edit modals — no new fetch)
- Filter rule: `'all'` → no filter; `'none'` → `c.groupId === null`; otherwise → `c.groupId === groupFilter.value`

**Age Range filter** — `ageBucket = ref<'all' | 'under1' | '1to3' | '3to5' | '5plus'>('all')`
- Options: All Ages, 0–12 Months, 1–3 Years, 3–5 Years, **5+ Years**
- The mockup only has the first three buckets (generic daycare demo copy); a 4th "5+ Years" bucket is added so a child who has aged past 5 doesn't silently disappear from every specific age filter — only "All Ages" would show them otherwise, which is a correctness gap, not a style choice.
- Uses the already-computed integer `child.age` (from `computeAge()`, whole years — no new precision needed): `under1` → `age === 0`, `1to3` → `age === 1 || age === 2`, `3to5` → `age === 3 || age === 4`, `5plus` → `age >= 5`.

Both filters combine with the existing status-tab and search filtering in the same `filteredItems` computed (AND semantics — all active filters must match).

---

## 4. Stat cards moved to the bottom

The three existing `BaseStatCard`s (unchanged props — icon bubbles already landed in UI-2) move from above the table card to below it, matching the mockup's layout. No new data, no trend lines.

---

## 5. i18n additions (both `ro.json` and `en.json`, under the `children` namespace)

```json
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
"pagination": {
  "showing": "Showing {from}–{to} of {total} children"
},
"viewProfile": "View profile"
```

Existing `children.filter.*` (status tabs) and `children.table.*` keys are untouched.

---

## 6. Testing

- `src/shared/ui/BasePagination.test.ts` — new, same style as the other three `Base*` component tests (`@vue/test-utils` + happy-dom): renders `summary` slot content, hides the pager when `total <= pageSize`, emits `update:page` when a page control is clicked.
- No new test file for `ChildrenListPage.vue` — it has no existing component test today, consistent with the other list pages post UI-0–2.
- Verification gate before each commit: `npm run lint && npm run typecheck && npm run test`, all green.

---

## 7. Files touched

- Create: `src/shared/ui/BasePagination.vue`, `src/shared/ui/BasePagination.test.ts`
- Modify: `src/modules/children/pages/ChildrenListPage.vue`
- Modify: `src/core/i18n/locales/ro.json`, `src/core/i18n/locales/en.json`
