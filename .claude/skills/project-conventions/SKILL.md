---
name: project-conventions
description: Startica's recorded code-structure decisions — module boundaries, composition root, ports via provide/inject, shared session kernel, services returning Result<T, AppError>, store screen states, page error rendering, aliases, tests, git, and migration status. Use before adding or moving a module, store, service, page, alias, cross-module dependency, error message or test in this repo; cite the section instead of re-deciding.
---

# Startica project conventions

## Scope

Records what `senior-architecture` decided for this repo (Nuxt 3 · Supabase · Pinia 3 · Nuxt UI 3). `CLAUDE.md` owns product and data rules (multi-tenancy, soft delete, RLS, GDPR, i18n). This file owns code structure; where the two disagree on structure, this file wins and `CLAUDE.md` gets corrected.

Design, current-state audit and migration plan: `docs/superpowers/specs/2026-09-13-architecture-refactor-design.md`.

## Triggers

- Creating or moving a file under `src/modules`, `src/shared`, `src/core`, `src/plugins`, `src/server`.
- One module needs data or behavior owned by another.
- Adding a store, a service, a page with async data, or a user-facing error.
- Writing tests for a store or a service.
- Writing a commit message.

## Migration status

Update this table in the commit that lands a step.

| Area | State |
|---|---|
| Aliases `@core` `@shared` `@modules` `@test-support` | done (step 1) |
| Core primitives (`AppError`, latest-request guard, `ScreenStatus`, `useAppErrorMessage`, `useLocaleFormat`) | done (step 2) |
| `shared/session/tenant.store.ts` | done (step 3) |
| Boundary lint (`boundaryEnforcedModules` in `eslint.config.mjs`) | enforced: `billing`, `payments` (step 4), `expenses` (step 7) |
| Global error handling (`src/error.vue`, `NuxtErrorBoundary` in the admin layout, `plugins/error-reporting.ts`) | done (step 5) |
| `shared/session/actor.store.ts` + `shared/permissions` (pure policy, `usePermissions`); no module outside `auth` reads `useAuthStore` | done (step 6) |
| All other modules | legacy layout — see Legacy notes |

A module counts as migrated only when its name is in `boundaryEnforcedModules` on `main`.

## Rules

### 1. Layers and import direction

- Composition root = `src/pages`, `src/layouts`, `src/plugins`, `src/middleware`, `src/server`. Only these import more than one module.
- `src/modules/<module>` imports `@shared/*`, `@core/*` and its own files (relative). Never `@modules/<other>` or `~/modules/<other>`.
- `src/shared` and `src/core` never import a module.
- `core/` = infrastructure without domain words: Supabase client, errors, async guards, session reset, email, i18n.
- `shared/` = used by ≥ 2 modules: `ui/` (Base*, no business logic), `schemas/` (Zod), `session/` (selected kindergarten, current actor), `permissions/` (pure policy + `usePermissions`), `types/`, `composables/`, `contracts/` (port types with ≥ 2 consumers).

### 2. Module shape

```text
modules/<module>/
├── index.ts                  # client public API: only what the composition root imports
├── server.ts                 # server public API, only if a server route uses the module
├── <module>.dependencies.ts  # InjectionKey + inject<Module>Dependencies(), only if the module has ports
├── README.md                 # purpose, public API, ports, dependencies, events, known limits
├── pages/*Page.vue           # routed; imported only by src/pages/* wrappers
├── components/               # module-only components
├── composables/              # UI logic (forms, filters) — never a pass-through around the store
├── stores/*.store.ts         # Pinia setup store: state + orchestration, dependencies injected
├── services/*.service.ts     # create<Module>Service(client) → interface from types; the only DB caller
├── types/*.types.ts          # domain types, service interface, ports, <Module>Dependencies
└── utils/                    # pure domain rules
```

- No barrels in subfolders, no `export *`.
- `nuxt.config.ts` keeps `dir: { modules: 'nuxt-modules' }` (D9); without it Nuxt loads every `src/modules/<name>/index.ts` as a Nuxt module.
- A migrated module is removed from `components.dirs` and `imports.dirs` in `nuxt.config.ts`: auto-import counts as an import.

### 3. Cross-module dependencies

- The consumer declares the port type in its own `types/` (`ListPayableInvoices` in payments). The provider satisfies it structurally, without importing the consumer.
- `src/plugins/module-dependencies.ts` creates services per request and calls `nuxtApp.vueApp.provide(<module>DependenciesKey, …)`. Stores read them once at setup with `inject<Module>Dependencies()`.
- Current user inside a migrated module: the `readCurrentActorId` port, bound to `useActorStore().actorId` in `module-dependencies.ts`. A legacy module reads `useActorStore` from `@shared/session/actor.store`. Never `useAuthStore` outside `modules/auth`.
- Only `modules/auth` writes the actor store (`setActor`, `setModuleGrants`, `clear`); others may call `updateProfile` after saving their own profile. `resetSessionStores` preserves the `auth` and `actor` stores; auth clears the actor explicitly.
- Authorization: `usePermissions()` from `shared/permissions`, backed by the pure `isActionAllowed` / `resolvePayrollScope` / `canActorManagePoolTrainer` in `permission-policy.ts`. New rules go in the policy with a test, never as role checks in a page.
- Selected kindergarten: `useTenantStore` from `@shared/session/tenant.store`.
- No domain event bus yet (D5). Add `shared/contracts/domain-events.ts` + `core/events/` in the same change that introduces the first module reacting to another module's change.

### 4. Services

- Methods on an interface returning `Promise<Result<T, AppError>>`. Expected failures never throw.
- Reads filter `kindergarten_id` and `deleted_at IS NULL`. Mutations also filter `kindergarten_id` and the allowed source status, then `.maybeSingle()`; no row → `{ kind: 'refused', reason: '<domain_reason>' }`.
- Rows typed with generated `Tables<'table'>`. No `Record<string, unknown>` casts.
- Validate input with the shared Zod schema before any query (`appErrorFromValidation`).
- Tenant totals and counts come from a Postgres RPC, not a client-side reduce: PostgREST caps lists at 1000 rows.

### 5. Stores and screen state

- Setup stores. Expose `status: ScreenStatus` (`loading | ready | empty | failed`), derived from `loadPhase` and list length, plus `loadError: AppError | null`.
- Every load calls `createLatestRequestGuard().begin()` and drops the response when `!request.isLatest()`. Switching kindergarten clears the previous tenant's rows before the new fetch resolves.
- Pending state per row (`isSettling(invoiceId)`), not one shared `loading` flag.
- Mutations return `Result<T, AppError>`; the page decides the toast.
- Every value SSR must hydrate is a returned `ref` (`loadedKindergartenId` included).

### 6. Pages and user-facing errors

- Load with `useLazyAsyncData(key, () => store.load(kindergartenId), { watch: [kindergartenId] })`; the callback returns a non-undefined value.
- Render exactly one of: no kindergarten selected · loading · failed (`UAlert` + retry) · empty · ready.
- Error text only through `useAppErrorMessage()` → `errors.network`, `errors.validation`, `errors.refused.<reason>`. Never render a Supabase `error.message`.
- A client-side render crash inside the admin layout shows `BasePageError` through `BasePageBoundary`. Nuxt 3's `NuxtErrorBoundary` never resets itself, so `BasePageBoundary` clears it on retry and on every `route.path` change. Fatal and SSR errors render `src/error.vue` (404 vs unexpected, never the raw message).
- Unexpected errors are reported only through `reportError` from `@core/errors/report-error`, called by `plugins/error-reporting.ts` for `vue:error` and `app:error`. `NuxtErrorBoundary` already forwards what it catches to `vue:error`: do not add an `@error` reporter. `detail` never carries user data such as `route.fullPath`.
- Nuxt UI v3: `UModal v-model:open` with `#content`; `UButton`, `UBadge`. `BaseButton` and `BaseBadge` do not exist.
- Money and dates format through `useLocaleFormat()` (active i18n locale). Postgres `date` columns use `formatCalendarDate` (formatted in UTC); a default "today" is built from local date parts, never `toISOString()`.
- A page over ~250 lines gets split into components and a form composable.

### 7. Aliases

- `aliases.config.ts` is the only alias source, read by `nuxt.config.ts` (generates tsconfig paths) and `vitest.config.ts`.
- `@core/…`, `@shared/…`, `@modules/<name>`, `@test-support/…`. Relative imports only inside one module. `~/` is legacy.

### 8. Tests

- `x.test.ts` next to `x.ts`; Playwright in `tests/e2e`; reusable fakes in `tests/support`.
- Services: `createSupabaseClientFake` from `@test-support/supabase-client-fake`; assert tenant, soft-delete and status filters.
- Stores: real DI — `app.use(pinia); app.provide(<module>DependenciesKey, fakeDependencies)`. No `vi.mock` of project modules.
- Test names state observable behavior. Every list store covers stale response and kindergarten switch.

### 9. Git

- Conventional Commits `type(scope): subject`, imperative; scope = module or layer (`billing`, `core`, `lint`).
- No mention of AI or agents, no `Co-Authored-By`, no session trailers.
- File moves and behavior changes never share a commit. Each commit leaves lint, typecheck, tests and build green.

## Legacy notes (unmigrated modules)

- Stores still call `useSupabaseClient()` and `useStoreAction`, and modules still reach other modules' stores through auto-import. Do not copy these into new code.
- `src/core/middleware/auth.ts` and `plugins/auth-state.client.ts` still call `useAuthStore` through auto-import; they belong to the composition root and move there in the close-out step.
- New code inside a legacy module follows rules 4–9 wherever that needs no file move.

## Decision log

| # | Date | Decision | Reason |
|---|---|---|---|
| D1 | 2026-09-13 | Keep `src/modules`, add alias `@modules` instead of renaming to `features` | Rename costs every import, adds no boundary |
| D2 | 2026-09-13 | Composition root = Nuxt's `pages`, `layouts`, `plugins`, `middleware`, `server`; no `src/app/` | Nuxt 3 has no app layer; `app/` is Nuxt 4's srcDir |
| D3 | 2026-09-13 | Ports injected with Vue provide/inject from `plugins/module-dependencies.ts` | Per-request instances on SSR; stores testable with fakes (verified: Pinia setup stores resolve app-level `inject`) |
| D4 | 2026-09-13 | Selected kindergarten and current actor live in `shared/session` | Read by 10+ modules; owning them in `kindergartens`/`auth` coupled everything to those modules |
| D5 | 2026-09-13 | No event bus | No module reacts to another module's change today |
| D6 | 2026-09-13 | `AppError` = `network` / `refused{reason}` / `validation{issues}`, rendered via i18n keys | Raw Postgres messages reached the UI; retry vs final refusal was indistinguishable |
| D7 | 2026-09-13 | Boundaries enforced by `no-restricted-imports` regex patterns plus a growing `boundaryEnforcedModules` list | Blocks regressions between migration steps; verified with probe files |
| D8 | 2026-09-13 | CLAUDE.md rule "communicate via a module's public store" superseded by D3/D4 | Public stores hid auth and tenant coupling in 8 modules |
| D9 | 2026-09-13 | Point Nuxt's local-modules directory elsewhere (`dir.modules`) instead of renaming `src/modules` | `src/modules/*/index.ts` broke `nuxi prepare`; renaming touches ~140 imports and three open worktree branches. Revisit at the Nuxt 4 upgrade |

## Minimal example

```ts
// modules/payments/types/payments.types.ts — consumer owns the port
export type ListPayableInvoices = (kindergartenId: string) => Promise<Result<PayableInvoice[], AppError>>

// plugins/module-dependencies.ts — composition root binds it
nuxtApp.vueApp.provide(paymentsDependenciesKey, {
  paymentsService: createPaymentsService(client),
  listPayableInvoices: kindergartenId => billingService.listPayableInvoices(kindergartenId),
  readCurrentActorId,
})

// modules/payments/stores/payments.store.ts — module never imports billing
const { paymentsService, listPayableInvoices, readCurrentActorId } = injectPaymentsDependencies()
```

```text
refactor(payments): receive payable invoices through an injected port
```
