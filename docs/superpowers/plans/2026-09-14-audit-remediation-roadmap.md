# Audit Remediation Roadmap

> **For agentic workers:** this file is an index, not an executable plan. Execute the linked plans one at a time with superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Fix every verified finding of the 2026-09-14 code audit, most severe first, in PR-sized plans that each leave `main` shippable.

**Source:** audit report https://claude.ai/code/artifact/ed5a70e1-2e16-43e9-b87b-937cc791489c (verified on `main` at `b650fb2`), plus two findings added while planning P1 (settings never loaded before saving; `USelect :options`).

**Architecture context:** `docs/superpowers/specs/2026-09-13-architecture-refactor-design.md` (§6 migration plan, steps 7–11) and `.claude/skills/project-conventions/SKILL.md`. Findings that belong to a module migration are fixed inside that module's step 7 PR, not duplicated here.

## Order

| # | Plan | Severity covered | Why this position | Depends on |
|---|---|---|---|---|
| P1 | [Settings kindergarten section](2026-09-14-p1-settings-kindergarten-section.md) | 3 critic, 3 important | Saving silently overwrites stored kindergarten settings with defaults; logo upload reports false success | — |
| P2 | [Finish the expenses module](2026-09-14-p2-expenses-module-finish.md) | 3 critic, 2 important | Expenses page on `main` is unusable; the fix is already written in `.worktrees/expenses-module` | — |
| P3 | [Legacy error display](2026-09-14-p3-legacy-error-display.md) | 5 important, 2 minor | Raw database text and `actorId ?? ''` reach users in every legacy module until step 7 lands | — |
| P4 | [Safe cleanups](2026-09-14-p4-safe-cleanups.md) | 1 important, 8 minor | Mechanical, behavior-neutral; last so it rebases over P2/P3 | P2, P3 merged |
| S7 | Spec step 7 — remaining modules, one PR each | important | Absorbs the structural findings below | P1–P4 merged |
| S8–S11 | Spec steps 8–11 | important / minor | Unchanged order from the spec | S7 |

P1, P2 and P3 touch disjoint files except the locale JSON files. Whichever merges second rebases and re-runs its locale script (the scripts refuse to overwrite existing keys, so a rebase cannot silently drop a key).

## Findings → where they are fixed

### Category 1 — AI fingerprints

| Finding | Location | Fixed in |
|---|---|---|
| Kindergarten settings never loaded before save; save overwrites stored values with defaults | `src/modules/settings/pages/SettingsPage.vue:172-176` | P1 Task 2–3 |
| Logo upload ignores the database result and toasts success | `SettingsPage.vue:135-147` | P1 Task 1–3 |
| `USelect :options` (Nuxt UI v2 prop) — timezone and language selects have no choices | `SettingsPage.vue:367,379` | P1 Task 3 |
| Kindergarten section shown to every role; RLS lets only a super admin update | `SettingsPage.vue:30-35` | P1 Task 2–3 |
| `actorStore.actor?.id \|\| ''` as `updated_by` | `SettingsPage.vue:138` | P1 Task 3 |
| Raw error toast on password reset | `SettingsPage.vue:160` | P1 Task 3 |
| Expenses page uses non-existent `BaseButton`/`BaseBadge`, `UModal v-model` | `src/modules/expenses/pages/ExpensesListPage.vue` | P2 |
| Expense approve/reject unfiltered by kindergarten, status, `deleted_at` | `src/modules/expenses/services/expenses.service.ts:75-106` | P2 |
| Approve does not refresh summary; shared loading flag; no stale guard | `src/modules/expenses/stores/expenses.store.ts` | P2 |
| `todayAsCalendarDate` about to be duplicated | `src/modules/payments/components/RecordPaymentModal.vue:19-24` | P2 Task 1 |
| `actorId ?? ''` in pool store and trainer settings | `src/modules/pool/stores/pool.store.ts:26,33,48,55,70,83,93`, `PoolTrainerSettingsPage.vue:11` | P3 Task 2–3 |
| `loading = true` without `finally` | `pool.store.ts:17-24,39-46,61-68` | P3 Task 2 |
| Raw error text in toasts and alerts | children, groups, dashboard, pool, staff pages (list in P3) | P3 Task 1, 3, 4 |
| `toLocaleDateString('ro-RO')` ignores UI locale | `src/modules/kindergartens/pages/KindergartensListPage.vue:107` | P3 Task 6 |
| `as unknown as UpdateChildInput/UpdateGuardianInput`, `as string` before guard | `src/modules/children/pages/ChildProfilePage.vue:76,123,128,146` | P3 Task 5 |
| History comments, banner comments | `children.store.ts:32-34`, `guardians.store.ts:21-23`, 5 templates | P4 Task 1 (SettingsPage banners in P1) |
| `UserRole`/`UserStatus` redeclared | `src/shared/types/page-meta.d.ts:3`, `src/modules/staff/services/staff.service.ts:9-10` | P4 Task 2 |
| Pass-through composables (9) | `useKindergartens`, `useDashboard`, `usePool`, `useAttendance`, `useChildren`, `useGuardians`, `useGroups`, `useStaff`, `useExpenses` | S7 per module (`useExpenses` in P2) |
| Profile + audit-log blocks copied in invite route | `src/server/api/staff/invite.post.ts:111-202` | S8 |
| Children per group counted over a list capped at 1000 rows | `groups.service.ts:46-49`, `dashboard.service.ts:78-81` | S7 groups PR (new RPC `group_children_counts`, needs a migration) |
| Mixed `useStoreAction` and hand-written loading blocks | groups, children, guardians, staff, dashboard stores | S7 per module |
| Duplicated initials logic | `src/layouts/admin.vue:36-39`, `SettingsPage.vue:39-42` | S7 settings PR + S11 (layout) |
| Status → badge color in three styles | billing, payments, children, kindergartens, expenses pages | S7 per module (standardize on typed map) |
| Sequential awaits, N+1 session generation, derivable `participantCount` | `ModuleAssignmentPanel.vue:33-38`, `staff.store.ts:130-137`, `pool.service.ts:249-269`, `pool.store.ts:82-99` | S7 staff and pool PRs |
| Monolithic pages (521–260 lines) | children, staff, settings, groups, dashboard pages | S10 |
| `pool.service.ts` 444 lines, untyped rows, `as any` tests | `src/modules/pool/services/*` | S7 pool PR (split per entity, `Tables<>` rows, `createSupabaseClientFake`) |
| `Record<string, unknown>` row casts | children, guardians, groups services | S7 per module |
| `row.module_key as ModuleKey` without validation | `src/modules/auth/services/moduleAccess.service.ts:23` | S7 auth PR |
| Three near-identical versioned try/catch/finally blocks | `src/modules/attendance/stores/attendance.store.ts:49-140` | S7 attendance PR (latest-request guard) |
| `(row: any)` with eslint-disable; role/status narrowed by `as` | `src/modules/staff/services/staff.service.ts:181-182`, `src/modules/staff/stores/staff.store.ts:16-17` | S7 staff PR |
| `q`, `v` variable names | `src/modules/expenses/services/expenses.service.ts:32,55` | P2 (already renamed in the rewrite) |

### Category 2 — unused code

| Finding | Location | Fixed in |
|---|---|---|
| `LoginCredentials`, `ExpenseRejectionInput` unused | `auth.types.ts:7`, `expense.schema.ts:39` | P4 Task 2 |
| `vue-i18n`, `h3`, `dotenv` imported but undeclared | `package.json` | P4 Task 4 |
| `attendance.types.ts` orphan; store redefines `AttendanceRecord` | `src/modules/attendance/**` | S7 attendance PR |
| `deleteKindergartenAvatar`, `listByChild` never called | `src/core/storage/avatar.service.ts:33`, `attendance.service.ts:45` | **Decision D1, D2** |
| `paymentStatuses`/`PaymentMethod`/`PaymentStatus` unused outside schema | `src/shared/schemas/payment.schema.ts:4,25-26` | **Decision D3** |
| `core/email/send.ts` stub not imported | `src/core/email/send.ts` | **Decision D4** |

### Category 3 — structure

| Finding | Location | Fixed in |
|---|---|---|
| Settings has no store; page calls service and client | `src/modules/settings/**` | S7 settings PR (P1 extracts the kindergarten composable first) |
| 8 legacy stores call `useSupabaseClient` | legacy modules | S7 |
| Hidden cross-module coupling via auto-import (8 pages, 4 not in spec A2) | `ChildrenListPage:16`, `ChildProfilePage:16`, `AttendancePage:9-10`, `GroupsListPage:17`, `GroupDetailPage:13-14`, `StaffListPage:18`, `PoolCalendarPage:8`, `PoolTrainerSettingsPage:8` | S7 (ports) — P4 Task 6 records the 4 new pages in the spec |
| `staffFilters.ts` domain rule in shared | `src/shared/utils/staffFilters.ts` | S7 staff PR |
| `shared/README.md` lists non-existent components | `src/shared/README.md` | P4 Task 5 |
| Server route deep-imports module services | `src/server/api/staff/invite.post.ts:4-5` | S8 |
| `core/middleware/auth.ts` uses auth store | `src/core/middleware/auth.ts:4` | S11 |
| Plugin relies on auto-imported `useAuthStore` | `src/plugins/auth-state.client.ts:5` | S7 auth PR (explicit import once `auth` has `index.ts`) |
| Mixed `~/` and `@core/@shared` imports in one file | 8 files | P4 Task 3 (pool store in P3 Task 2) |
| No `index.ts`/README in 10 modules; deep page imports | `src/pages/*.vue`, `src/modules/*` | S7 per module (expenses in P2) |
| Unvalidated `process.env` reads | `nuxt.config.ts:96-100` | S9 |

## Decisions needed before S7

- **D1 `deleteKindergartenAvatar`:** logo upload uses `upsert` on `<kindergartenId>.<ext>`, so a different extension leaves the old file behind. Either call it before upload when the extension changes, or delete the function. Recommendation: delete; stale files are harmless and there is no "remove logo" UI.
- **D2 `listByChild`:** delete unless a per-child attendance history is planned for V1.
- **D3 payment schema copies:** delete `paymentStatuses`, `PaymentStatus` and the unused `PaymentMethod` export so status has one source (the database enum in `payments.types.ts`).
- **D4 `core/email/send.ts`:** keep as the documented V2 seam (CLAUDE.md "Email") or move its comment to `docs/`. Recommendation: keep.
- **D5 `group_children_counts` RPC:** needs a migration and `supabase db push`; schedule it after the pending `20260913000001_payment_invoice_integrity.sql` push is confirmed on the hosted database.

## Global Constraints (apply to every plan)

- Conventional Commits `type(scope): subject`, imperative; no mention of AI or agents; no `Co-Authored-By` trailer.
- `main` is protected: one branch + PR per plan; required check `Typecheck · Lint · Test`; the user merges.
- Every commit leaves `npm run lint` (0 errors), `npm run typecheck`, `npx vitest run` and `npm run build` green.
- No hardcoded user-facing strings; RO and EN keys in `src/core/i18n/locales/{ro,en}.json`; never render a Supabase/Postgres error message.
