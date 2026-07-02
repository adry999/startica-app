# UI Design Alignment — Design Spec

**Date:** 2026-07-02
**Source audit:** `docs/Startica_Audit_2026-07-02_UI.md`
**Decision (user):** `design/mockups/startica_core/DESIGN.md` is the single design source of truth. `docs/Startica_DesignPrompt.md` is superseded for palette/radius/type-scale.
**Scope (user-approved):** UI-0 (tokens) + UI-1 (shell) + UI-2 (Base components). UI-3 (children directory pagination/kebab/filters) is a later round.

---

## 1. UI-0 — Token alignment (`src/assets/css/main.css`)

**Approach:** re-point the existing utility names. Templates keep using `teal-*`, `slate-*`, `border`, `app-bg`, `sidebar-bg`; only the hex values behind them change. No template churn for colors.

### 1.1 New `@theme` values

Teal ramp rebuilt around DESIGN.md primary `#005752` (confirmed by pixel-sampling the mockup PNGs: buttons `#004E48`–`#00524D`, active nav `#094F4D`):

```
--color-teal-50:  #E4F0EE   /* primary-soft — chip/badge/hover backgrounds */
--color-teal-100: #C7E0DD
--color-teal-200: #93C0BB
--color-teal-300: #4E938C
--color-teal-400: #1F706A   /* old primary → container tone (DESIGN.md primary-container) */
--color-teal-500: #005752   /* PRIMARY — buttons, links, active nav, focus */
--color-teal-600: #004A46   /* hover/pressed */
--color-teal-700: #003B38   /* darkest accents */
```

Slate ramp aligned to the Ink scale (400/500/700 exact from DESIGN.md, 800 = ink-900/on-surface):

```
--color-slate-50:  #F4F6F6
--color-slate-100: #E7EAEA
--color-slate-200: #D2D7D8
--color-slate-300: #AEB6B9
--color-slate-400: #889094   /* ink-400 */
--color-slate-500: #636C70   /* ink-500 */
--color-slate-600: #434E53   /* ink-700 */
--color-slate-800: #131D21   /* ink-900 — headings */
```

Semantic + surfaces:

```
--color-success:    #3E8A6E   (was #3E8E7E)
--color-warning:    #D89B3F   (unchanged)
--color-error:      #C0553D   (was #C0492F)
--color-info:       #3B7A9E   (unchanged)
--color-brand-gold: #C98A2B   (accent-deep; was #D89B3F)
--color-sidebar-bg: #2C363A   (dark ink, sampled from mockups; was #0F2825 dark teal)
--color-app-bg:     #F6F7F5   (unchanged)
--color-border:     #E3E7E5   (unchanged)
--color-surface:    #FFFFFF   (unchanged)
--color-role-super-admin-bg: #005752   (follows primary)
```

`brand-yellow/peach/sage/cream/slate` and the other role-badge tokens stay as-is (logo-derived accents, not contradicted by DESIGN.md).

### 1.2 Radii

```
--radius-card:    16px   (was 12px — matches the rounded-2xl pages already use)
--radius-control: 10px   (was 8px)
```

Nuxt UI controls follow their own `--ui-radius` scale: set `:root { --ui-radius: 0.4rem }` in `main.css` so buttons/inputs render ≈10px. Implementation must verify the rendered radius on a `UButton`/`UInput` and adjust the value if Nuxt UI's multiplier lands off 10px.

### 1.3 Type scale

New display token used by page titles (values from DESIGN.md typography):

```
--text-display:                 2rem;
--text-display--line-height:    2.5rem;
--text-display--font-weight:    600;
--text-display--letter-spacing: -0.02em;
```

Usage: `text-display` (+ `font-semibold` fallback where the weight variable isn't picked up).

### 1.4 Documentation updates

- `main.css` header comment: source of truth is now `design/mockups/startica_core/DESIGN.md`.
- `CLAUDE.md` "Design assets & handoff": palette-token line points to DESIGN.md instead of `docs/Startica_DesignPrompt.md`.
- `docs/Startica_DesignPrompt.md`: banner at top — superseded for palette/radius/type-scale by DESIGN.md; still valid for UX copy (screens list, states, a11y).

---

## 2. UI-1 — Shell pass (`src/layouts/admin.vue` + `ChildrenListPage`)

1. **Max-width container:** wrap the `<slot />` in `<main>` with `<div class="mx-auto w-full max-w-[1400px]">`.
2. **Topbar child search** (replaces the empty `flex-1` placeholder, left side):
   - `UInput` (~`w-64`) with magnifier icon, placeholder from new i18n key `topbar.searchPlaceholder` (ro: „Caută copil…", en: "Search child…").
   - Enter → `navigateTo({ path: '/children', query: { q } })` (param omitted when empty); input clears after navigation.
   - `ChildrenListPage`: seed `search` ref from `route.query.q` and `watch` it so repeated searches from the topbar work while already on the page.
   - No notification bell — no notification system exists; no dead UI.
3. **Sidebar CTA:** primary (teal) block button labeled with existing key `children.addTitle` („Adaugă copil"), placed above the Settings/Logout footer group, `v-if="can('create', 'children')"`. Navigates to `/children?add=1`.
   - `ChildrenListPage`: when `route.query.add === '1'` and `canMutate` and a specific kindergarten is selected → `openAdd()`, then strip the param via `router.replace` so it doesn't re-trigger. If kindergarten is `'ALL'`, the page's existing "select a kindergarten" prompt stands and the modal does not open.
4. Sidebar background changes via the `sidebar-bg` token (1.1) — no template change needed for color.

---

## 3. UI-2 — Shared Base components (`src/shared/ui/`)

All three are pure presentational: props in, events out, zero business logic, no store/service imports.

### `BasePageHeader.vue`
- Props: `title: string`, `subtitle?: string`.
- Slot: `actions` (right-aligned).
- Renders: flex row, `h1` with `text-display text-slate-800`, subtitle `text-sm text-slate-500`.

### `BaseStatCard.vue`
- Props: `label: string`, `value?: string | number`, `icon?: string`, `iconClass?: string` (bubble bg+text utility classes, passed by the page), `loading?: boolean`.
- Slot: `meta` (optional secondary line under the value — trend text, sublabel).
- Renders: `rounded-2xl border border-border bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.04)]`; uppercase caption label; icon bubble top-right when `icon` given; value `text-3xl font-semibold tabular-nums text-slate-800`; pulse placeholder when `loading`.

### `BaseFilterTabs.vue`
- Props: `items: Array<{ label: string; value: string }>`, `modelValue: string`. Emits `update:modelValue`.
- Renders: segmented pill control (per staff mockup): container `inline-flex rounded-full bg-slate-100 p-1`; active item `rounded-full bg-white shadow-sm text-slate-800`; inactive `text-slate-500`.

### Page migrations (adopt all three where applicable)
- `DashboardPage` — 4 stat cards → `BaseStatCard`; header → `BasePageHeader`.
- `ChildrenListPage` — header, 3 stat cards, status tabs → Base components.
- `GroupsListPage` — header, 4 stat cards, filter tabs → Base components.
- `StaffListPage` — header, 4 stat cards (fixing the stale `rounded-xl`/no-shadow style), filter tabs → Base components.
- `KindergartensListPage`, `SettingsPage` — header → `BasePageHeader`.
- Detail pages (`ChildProfilePage`, `GroupDetailPage`) keep their back-link headers this round.

---

## 4. i18n

New keys (ro + en): `topbar.searchPlaceholder`. Everything else reuses existing keys (`children.addTitle`, page titles/subtitles).

## 5. Testing & verification

- Vitest component tests for the three Base components (render props, `BaseFilterTabs` emits on click).
- `npm run lint`, `npm run typecheck`, `npm run test` must pass.
- Playwright e2e untouched (needs local Supabase). **Follow-up (not this round):** run the CLAUDE.md screenshot-compare-refine loop against the mockups once Docker is up.

## 6. Out of scope

UI-3 (children pagination, kebab actions, group/age filters), notifications/bell, avatar/photo uploads, Support link, breadcrumbs, detail-page redesigns, `supabase/seed.sql` working-tree change (separate commit by the user).
