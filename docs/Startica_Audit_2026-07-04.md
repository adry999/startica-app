# Startica App Audit — 2026-07-04

Scope: full-app state audit on branch `fix/security-and-quality`. Evidence: `npm run lint` / `typecheck` / `test` (all pass), module inventory scan, convention-violation scan, test/DB/i18n scan.

---

## 1. Health snapshot

| Check | Result |
|---|---|
| ESLint | ✅ clean (exit 0) |
| Typecheck (`nuxt typecheck`, strict TS) | ✅ clean |
| Vitest | ✅ 106/106 tests, 18 files |
| Playwright | 5 specs (auth, accept-invite, kindergartens, admin, staff), 0 skips — need live Supabase to run |
| i18n parity | ✅ 291 keys RO = 291 keys EN, no drift |
| Migrations | 15, RLS enabled on all tables (bulk in initial + explicit for `guardians`) |
| June 2026 security backlog | ✅ closed (C1/CR1, C2, H1–H4, M2) |

## 2. What works

- **All 7 V1 modules have pages** (12 total). Full CRUD service layer in 6/7 modules (auth, children, groups, kindergartens, dashboard, staff), including soft-delete / status lifecycle.
- **Children module is the most complete**: children + guardians services, age util, UI-3 features landed (BasePagination `bdd1c64`, kebab row actions `56d1df0`, Group + Age Range filters `4a48e4b`).
- **Shared UI layer**: BaseAvatar, BaseFilterTabs, BasePageHeader, BasePagination, BaseStatCard, AuthCardHeader, LanguageSwitcher — stateless, 4/7 with component tests.
- **No raw `$fetch` in components** — all fetching via `useAsyncData`/`useLazyAsyncData`. No hardcoded user-facing strings. No TODO/FIXME/not-implemented markers in code.
- **Server route** `src/server/api/staff/invite.post.ts` (staff invite) with test.
- **Seed data** (uncommitted rewrite): 5 accounts, 4 groups, 14 children with medical/GDPR fields, 14 guardians, sample audit logs — good demo fidelity.

## 3. What does not work / gaps

### 🔴 Architecture violations — Supabase called outside `services/`
Breaks CLAUDE.md rule 3 ("services is the only layer that talks to Supabase"):

| Location | Problem |
|---|---|
| `src/modules/settings/pages/SettingsPage.vue:8,31` | Page calls `useSupabaseClient()` + `.from('users').update()` directly |
| `src/modules/auth/stores/auth.store.ts:36,63,69,94,105` | 5 direct client calls in store |
| `src/modules/staff/stores/staff.store.ts:31,68,88,104` | 4 direct client calls in store |
| `src/modules/dashboard/stores/dashboard.store.ts:20` | Store queries `.from('users')` directly |
| `src/plugins/auth-state.client.ts:4` | Plugin uses client (borderline acceptable — auth state listener; document or wrap) |

### 🔴 Settings module has no service layer
Page only; `services/`, `stores/`, `composables/`, `types/` are `.gitkeep` empty. The direct DB call above is a symptom.

### 🟡 11 post-mutate SELECTs missing `.is('deleted_at', null)`
Insert/update then re-select without soft-delete filter (returns row if soft-deleted concurrently — low likelihood, cheap fix):
- auth.service `fetchCurrentUserProfile:45`
- children.service `createChild:97`, `updateChild:129`
- groups.service `getGroup:65`, `createGroup:105`, `updateGroup:133`
- kindergartens.service `createKindergarten:50`, `updateKindergartenDetails:73`, `updateKindergartenSettings:97`
- staff.service `updateStaffProfile:46`, `setStaffStatus:63`

### 🟡 Test coverage gaps
Zero unit tests in: **children** (services/stores/composables — the biggest module!), **groups**, **dashboard**, **settings**. Tested well: auth, kindergartens, staff, schemas, middleware, 4 UI components.

### 🟡 `staff.service.removeFromKindergarten:70`
Hard-deletes the `user_kindergartens` join row. Join tables may be a legitimate exception to the soft-delete rule, but it bypasses audit trail — decide and document.

### 🔵 Placeholders / deferred
- `ChildProfilePage.vue:254` enrollment stats card — static placeholder
- `ChildProfilePage.vue:390` recent activity — placeholder
- `DashboardPage.vue:173` attendance slot — deliberate (attendance deferred to PowerSync phase)

### 🔵 Process items
- `supabase/seed.sql` — large uncommitted rewrite; commit it.
- Live screenshot-compare loop (CLAUDE.md mandate) still never run — needs Docker/local Supabase.
- PR #9 (module-access) open with agreed follow-ups: panel-local error snapshot, refresh() after save, `granted_by = auth.uid()` with-check migration, audit trigger rename, saveModuleGrants failure tests.
- Manual browser pass of module-assignment drawer pending (needs live Supabase).

## 4. Improvement plan per module

| Module | Improvement | Effort |
|---|---|---|
| **settings** | Build `settings.service.ts` + store/composable; move `SettingsPage` DB call into it; add tests | S–M |
| **auth** | Move the 5 store client calls into `auth.service`; store keeps state only | S |
| **staff** | Same for 4 store calls; decide soft-delete vs hard-delete for join rows | S |
| **dashboard** | Move `dashboard.store` query into `dashboard.service`; add service tests | S |
| **children** | Add Vitest for children.service, guardians.service, useChildren, childAge; wire the 2 profile placeholders to live data | M |
| **groups** | Add service/store tests (archive/restore lifecycle esp.) | S |
| **all services** | Add `.is('deleted_at', null)` to the 11 post-mutate selects | S |
| **cross** | Commit seed.sql; run screenshot-compare loop once local Supabase up; land PR #9 + follow-up branch | M |

**Suggested order:** (1) settings service layer + store cleanups (one refactor PR — same pattern everywhere), (2) deleted_at filter sweep, (3) children/groups test backfill, (4) PR #9 follow-ups, (5) placeholders + screenshot loop.

## 5. Verdict

App is in good shape: quality gates all green, security backlog closed, CRUD complete, i18n disciplined. The debt is concentrated and mechanical — one missing service layer (settings), store-level DB calls in 3 modules, a soft-delete filter sweep, and test backfill for children/groups. No functional breakage found.
