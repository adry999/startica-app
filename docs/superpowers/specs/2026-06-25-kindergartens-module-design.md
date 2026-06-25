# Kindergartens module + shared admin shell — design

## Context

The auth module (login, forgot/reset password, middleware) is done and merged via PR #1. Nothing past `index.vue`'s placeholder exists yet — `kindergartens`, `staff`, `groups`, `children`, `dashboard`, and `settings` are all empty scaffold directories.

This is the first of six remaining V1 modules. Per the data model (`kindergartens` is the tenant root; `groups`/`children` carry `kindergarten_id`; `groups.educator_id` points at staff), the build order is:

**Kindergartens (incl. settings) → Staff → Groups → Children → Dashboard**

This spec covers *only* Kindergartens, plus the shared infrastructure every later module needs (admin shell layout, tenant store, permissions helper). Staff/Groups/Children/Dashboard each get their own design → plan → implementation cycle once this one ships.

## Reference design

`design/mockups/startica_core/DESIGN.md` (palette, spacing, component shapes) and `design/mockups/admin_dashboard_final/screen.png` (sidebar + topbar shell, modals for create/edit, pill-shaped status badges). Per `design/README.md`, this is visual/token reference only — never copy the mockup HTML, build in Nuxt UI + Tailwind using the existing `Base*` components and the palette tokens in `docs/Startica_DesignPrompt.md`.

## 1. Shared infrastructure

### `src/layouts/admin.vue`

A fixed 256px sidebar + 64px topbar shell (per the design system spacing tokens), replacing the bare `default.vue` placeholder for all authenticated, non-auth pages.

- **Sidebar items**: Overview, Kindergartens, Staff, Groups, Students.
  - Each item is gated by the existing `roles` page-meta + `role.ts` middleware mechanism (no new permission infra needed for *page-level* gating — that already exists from the auth module).
  - Kindergartens is `super_admin`-only.
  - An item whose target module isn't built yet renders disabled/greyed with a small "soon" indicator instead of a working link, so the shell looks complete without producing 404s as we build modules one at a time. Once a module ships, its item becomes a normal link — no shell change needed.
- **Topbar**: kindergarten switcher (new, see `useTenantStore` below), the existing `LanguageSwitcher`, and a user avatar menu with logout (reuses the existing `logout()` action from the auth store).
- `index.vue` (the current post-login placeholder) starts using this layout instead of its own ad-hoc centered-card markup.

### `src/modules/kindergartens/stores/tenant.store.ts` (`useTenantStore`)

```ts
state: () => ({
  selectedKindergartenId: 'ALL' as string | 'ALL',
})
```

- Super Admin defaults to `'ALL'`.
- Admin defaults to their first assigned kindergarten (or `'ALL'` if they have more than one).
- The topbar switcher writes to this store. It is **not** consumed by the Kindergartens list page itself — that page always shows every kindergarten the viewer is allowed to see (i.e. all of them, since the page is Super-Admin-only), regardless of the switcher. The switcher exists now so Staff/Groups/Children (built next) have it ready to scope their queries by `kindergarten_id`.
- No persistence (e.g. localStorage) for V1 — resets to the default on reload. Can be added later if it's annoying in practice.

### `src/shared/composables/usePermissions.ts`

```ts
type Action = 'create' | 'read' | 'update' | 'delete'
type Resource = 'kindergarten' // grows as later modules add resources

function can(action: Action, resource: Resource, target?: unknown): boolean
```

- For this pass, rules are role-based only: `super_admin` can do everything to `kindergarten`; everyone who can reach the page can `read`.
- The signature accepts an optional `target` (the specific row/entity) from day one, even though no rule uses it yet — so when Staff/Groups/Children need resource-level checks (e.g. "admin can update *their* kindergarten's settings", "educator can read children in *their* group"), the call sites (`can('update', 'kindergarten', someKindergarten)`) don't need to change, only the rule implementation does. This satisfies CLAUDE.md's "shape `can(action, resource)` around resource-level access now" guidance.
- The Kindergartens page uses this to show/hide the "New kindergarten" button and the Edit/Suspend row actions.

## 2. Kindergartens module

One page: `src/modules/kindergartens/pages/KindergartensListPage.vue`, routed at `/kindergartens`, `definePageMeta({ roles: ['super_admin'] })`.

- **List**: `BaseTable` of all kindergartens — name, city, status (pill badge: active/suspended), created date. Loading/error/empty states per the project's Definition of Done.
- **Create**: "New kindergarten" button (gated by `can('create', 'kindergarten')`) opens a modal with name/address/city/phone. `status` defaults to `active`. `settings` defaults to `{ timezone: 'Europe/Bucharest', default_locale: 'ro', working_hours: { start: '07:30', end: '18:00' } }` and is edited afterward via Edit, not at creation time.
- **Edit**: row action opens a modal with two sections:
  - *Details*: name, address, city, phone, status.
  - *Settings*: timezone (select), default locale (select: ro/en), working hours start/end (time inputs).
- **Suspend / Reactivate**: row action toggling `status` between `active` ↔ `suspended`, behind a confirm step (no separate modal).
- **No delete** — matches the project-wide "never hard-DELETE business data" rule; there is no DELETE RLS policy on `kindergartens` either.
- **Logo upload is out of scope** for this pass (the `logo_url` column stays unused for now) — flagged as a follow-up once Supabase Storage buckets/policies exist, not tracked as a defect since it's net-new scope, not a regression.

### Files

```
src/shared/schemas/kindergarten.schema.ts        — kindergartenDetailsSchema, kindergartenSettingsSchema (Zod)
src/modules/kindergartens/types/kindergarten.types.ts
src/modules/kindergartens/services/kindergartens.service.ts
  — list(client), create(client, details), updateDetails(client, id, details),
    updateSettings(client, id, settings), setStatus(client, id, status)
src/modules/kindergartens/stores/kindergartens.store.ts  — list state + the above actions
src/modules/kindergartens/stores/tenant.store.ts          — useTenantStore
src/modules/kindergartens/composables/useKindergartens.ts — thin wrapper (same shape as useAuth.ts)
src/shared/composables/usePermissions.ts
src/layouts/admin.vue
```

All Supabase access goes through `kindergartens.service.ts` (per the "services/ is the only layer that talks to Supabase" rule); the store wraps service calls; the page calls the store via `useAsyncData`/store actions, never `$fetch` directly.

## 3. i18n

New keys under a `kindergartens.*` namespace in both `ro.json` (default) and `en.json`: page title, table column headers, create/edit modal labels (details + settings sections), status labels, confirm-suspend/reactivate copy, empty state.

## 4. Testing

- **Vitest**:
  - `kindergartens.service.ts` — mocked Supabase client, same pattern as `auth.service.test.ts`.
  - `kindergartens.store.ts` — state transitions for list/create/update/setStatus, including the error path.
  - `tenant.store.ts` — default selection logic, switcher write.
  - `usePermissions.ts` — role → action → resource truth table.
  - `kindergarten.schema.ts` — valid/invalid input cases.
- **Playwright e2e** (`tests/e2e/kindergartens.spec.ts`):
  - Log in as `admin@startica.dev` (super admin): see the seeded kindergarten in the list, create a new one, edit its details, edit its settings, suspend it, reactivate it.
  - Negative case: log in as `educator.demo@startica.dev`, navigate directly to `/kindergartens`, confirm the existing role middleware redirects away.

## Out of scope for this pass

- Logo upload.
- Kindergarten deletion (not supported anywhere in the app per the soft-delete rule, and no RLS policy permits it).
- Persisting the tenant-switcher selection across reloads.
- Anything for Staff/Groups/Children/Dashboard — separate specs.
