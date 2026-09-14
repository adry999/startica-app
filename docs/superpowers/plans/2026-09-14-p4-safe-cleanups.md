# P4 — Safe Cleanups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the audit's behavior-neutral noise — history and banner comments, duplicated types, unused exports, mixed import aliases, a stale README, undeclared dependencies — and record the audit's structural follow-ups in the refactor spec.

**Architecture:** Mechanical edits only; no runtime behavior changes. Each task is its own commit so a reviewer can reject one without the others. The gates (lint, typecheck, tests, build) are the proof that nothing changed behavior.

**Tech Stack:** Nuxt 3.21, TypeScript 5.9, Vitest 4, npm.

**Spec:** Audit report https://claude.ai/code/artifact/ed5a70e1-2e16-43e9-b87b-937cc791489c · roadmap `docs/superpowers/plans/2026-09-14-audit-remediation-roadmap.md` · `docs/superpowers/specs/2026-09-13-architecture-refactor-design.md`.

## Global Constraints

- Start only after P2 and P3 are merged (both touch files edited here: the spec, `ChildProfilePage.vue`, `pool.store.ts`).
- Conventional Commits; no AI/agent mention; no `Co-Authored-By`.
- Every commit: lint 0 errors, typecheck, `npx vitest run`, build green; gates sequential.
- Do not change behavior. If a gate fails after a mechanical edit, revert that edit and report — do not "fix forward".
- Do not touch `src/modules/settings/pages/SettingsPage.vue` (P1 owns it).

## Setup (once)

```powershell
$repo = "D:\CODE\startica\app"
git -C $repo fetch origin
git -C $repo worktree add -b chore/audit-safe-cleanups "$repo\.worktrees\audit-safe-cleanups" origin/main
New-Item -ItemType Junction -Path "$repo\.worktrees\audit-safe-cleanups\node_modules" -Target "$repo\node_modules" | Out-Null
```

Run later commands from that worktree; run `npx nuxi prepare` once.

---

### Task 1: Comments that narrate history or only decorate

**Files:**
- Modify: `src/modules/children/stores/children.store.ts:32-34`
- Modify: `src/modules/children/stores/guardians.store.ts:21-23`
- Modify: `src/layouts/admin.vue:94,170`
- Modify: `src/modules/children/pages/ChildProfilePage.vue:193,269`
- Modify: `src/modules/staff/pages/StaffListPage.vue:303`
- Modify: `src/modules/dashboard/pages/DashboardPage.vue:50,55,87,167`

- [ ] **Step 1: Replace the history comments**

In `children.store.ts` replace:
```ts
    // Returns the child so a profile page can render it directly. Previously
    // this returned undefined on success, so `if (result) child.value = result`
    // in ChildProfilePage was dead code and the profile never populated.
```
with:
```ts
    // Returns the child so a profile page can render it directly.
```

In `guardians.store.ts` replace:
```ts
    // Returns boolean like update/remove below. It used to return undefined on
    // success, so the caller's `if (ok)` never fired and adding a guardian
    // showed no confirmation.
```
with:
```ts
    // Returns whether the guardian was created, like update and remove below.
```

- [ ] **Step 2: Delete the banner comment lines**

Delete each of these whole lines:
- `src/layouts/admin.vue`: `    <!-- ── Sidebar ──────────────────────────────────────────────────────── -->` and `    <!-- ── Main ─────────────────────────────────────────────────────────── -->`
- `src/modules/children/pages/ChildProfilePage.vue`: `        <!-- ── Left panel (1/3) ───────────────────────────────────────────── -->` and `        <!-- ── Right panel (flex-1) ──────────────────────────────────────── -->`
- `src/modules/staff/pages/StaffListPage.vue`: `    <!-- ── Modals ────────────────────────────────────────────────────────── -->`
- `src/modules/dashboard/pages/DashboardPage.vue`: `    <!-- ── Page header ───────────────────────────────────────────────────── -->`, `    <!-- ── Row 1: Stat cards ─────────────────────────────────────────────── -->`, `    <!-- ── Row 2: Recent Activity + Quick Actions ─────────────────────────── -->`, `    <!-- ── Row 3: Active Groups + Staff on Duty ───────────────────────────── -->`

- [ ] **Step 3: Verify**

Run: `grep -rn "── \|Previously\|It used to" src --include=*.vue --include=*.ts | grep -v "\.test\.ts\|SettingsPage.vue"`
Expected: no output.

- [ ] **Step 4: Gates and commit**

```bash
npx vitest run && npm run lint && npm run typecheck
git add src/modules/children/stores src/layouts/admin.vue src/modules/children/pages/ChildProfilePage.vue src/modules/staff/pages/StaffListPage.vue src/modules/dashboard/pages/DashboardPage.vue
git commit -m "chore: drop comments that narrate history or only decorate templates"
```

---

### Task 2: Duplicated and unused types

**Files:**
- Modify: `src/shared/types/page-meta.d.ts:1-3`
- Modify: `src/modules/staff/services/staff.service.ts:1-10`
- Modify: `src/modules/auth/types/auth.types.ts`
- Modify: `src/shared/schemas/expense.schema.ts:39`

- [ ] **Step 1: Confirm the unused exports are still unused**

Run: `grep -rlw "LoginCredentials\|ExpenseRejectionInput" src`
Expected: only `src/modules/auth/types/auth.types.ts` and `src/shared/schemas/expense.schema.ts`. Anything else: stop and report.

- [ ] **Step 2: Import shared role types**

In `page-meta.d.ts` replace:
```ts
import type { Database } from '~/core/supabase/types'

type UserRole = Database['public']['Enums']['user_role']
```
with:
```ts
import type { UserRole } from '@shared/session/actor.types'
```

In `staff.service.ts` replace:
```ts
import type { ModuleKey } from '@shared/session/actor.types'
```
with:
```ts
import type { ModuleKey, UserRole, UserStatus } from '@shared/session/actor.types'
```
and delete:
```ts
type UserRole = Database['public']['Enums']['user_role']
type UserStatus = Database['public']['Enums']['user_status']
```

- [ ] **Step 3: Delete unused exports**

In `auth.types.ts` delete:
```ts

export interface LoginCredentials {
  email: string
  password: string
}
```

In `expense.schema.ts` delete:
```ts
export type ExpenseRejectionInput = z.infer<typeof expenseRejectionSchema>
```

- [ ] **Step 4: Gates and commit**

```bash
npx vitest run && npm run lint && npm run typecheck
git add src/shared/types/page-meta.d.ts src/modules/staff/services/staff.service.ts src/modules/auth/types/auth.types.ts src/shared/schemas/expense.schema.ts
git commit -m "refactor(types): import shared role types and drop unused exports"
```

---

### Task 3: One alias style per file

**Files:**
- Modify: `src/modules/auth/stores/auth.store.ts:2-4`
- Modify: `src/modules/staff/composables/useStaff.ts:3`
- Modify: `src/modules/staff/pages/StaffListPage.vue:9`
- Modify: `src/modules/staff/services/staff.service.ts:2,3,5`
- Modify: `src/modules/staff/stores/staff.store.ts:2,5,9`
- Modify: `src/modules/kindergartens/stores/kindergartens.store.ts:2,4`
- Modify: `src/modules/attendance/stores/attendance.store.ts:2,3`

- [ ] **Step 1: Rewrite `~/core/` and `~/shared/` specifiers in exactly these files**

```bash
node -e "
const fs=require('fs');
const files=['src/modules/auth/stores/auth.store.ts','src/modules/staff/composables/useStaff.ts','src/modules/staff/pages/StaffListPage.vue','src/modules/staff/services/staff.service.ts','src/modules/staff/stores/staff.store.ts','src/modules/kindergartens/stores/kindergartens.store.ts','src/modules/attendance/stores/attendance.store.ts'];
for (const file of files) {
  const before=fs.readFileSync(file,'utf8');
  const after=before.replace(/from '~\/core\//g,\"from '@core/\").replace(/from '~\/shared\//g,\"from '@shared/\");
  if (after===before) throw new Error('no change in '+file);
  fs.writeFileSync(file,after);
  console.log(file);
}"
```

Expected: the seven paths printed.

- [ ] **Step 2: Verify**

Run: `grep -n "from '~/" src/modules/auth/stores/auth.store.ts src/modules/staff/composables/useStaff.ts src/modules/staff/pages/StaffListPage.vue src/modules/staff/services/staff.service.ts src/modules/staff/stores/staff.store.ts src/modules/kindergartens/stores/kindergartens.store.ts src/modules/attendance/stores/attendance.store.ts`
Expected: no output (these files only imported `~/core` and `~/shared`).

- [ ] **Step 3: Gates and commit**

```bash
npx vitest run && npm run lint && npm run typecheck && npm run build
git add src/modules/auth/stores/auth.store.ts src/modules/staff src/modules/kindergartens/stores/kindergartens.store.ts src/modules/attendance/stores/attendance.store.ts
git commit -m "refactor(modules): use boundary aliases for core and shared imports"
```

Note: `vi.mock('~/core/supabase/client')` in existing tests keeps working — both specifiers resolve to the same file.

---

### Task 4: Declare directly imported dependencies

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Record the installed versions**

Run: `npm ls vue-i18n h3 dotenv --depth=0 --all 2>/dev/null; node -e "const l=require('./package-lock.json'); for (const p of ['vue-i18n','h3','dotenv']) console.log(p, l.packages['node_modules/'+p]?.version)"`
Expected: `vue-i18n 11.4.6`, `h3 1.15.11`, `dotenv 17.4.2`. If different, use the printed versions below.

- [ ] **Step 2: Declare them without upgrading**

```bash
npm install --save vue-i18n@^11.4.6 h3@^1.15.11
npm install --save-dev dotenv@^17.4.2
```

- [ ] **Step 3: Verify nothing else moved**

Run: `git diff --stat package.json package-lock.json` and `node -e "const l=require('./package-lock.json'); for (const p of ['vue-i18n','h3','dotenv']) console.log(p, l.packages['node_modules/'+p]?.version)"`
Expected: `package.json` gains exactly three dependency lines; the three versions are unchanged. If other packages changed versions in the lock file, run `git checkout package.json package-lock.json` and report.

- [ ] **Step 4: Gates and commit**

```bash
npx vitest run && npm run lint && npm run typecheck && npm run build
git add package.json package-lock.json
git commit -m "build(deps): declare vue-i18n, h3 and dotenv that the code imports directly"
```

---

### Task 5: Rewrite the shared README to the real inventory

**Files:**
- Modify: `src/shared/README.md`

- [ ] **Step 1: Replace the whole file with:**

```markdown
# shared/ — code used by two or more modules, no module imports

Rules: `.claude/skills/project-conventions/SKILL.md` §1. Nothing here imports `src/modules`.

- `ui/` — presentational components, props in and events out: `BaseAvatar`, `BaseFilterTabs`, `BasePageBoundary`, `BasePageError`, `BasePageHeader`, `BasePagination`, `BaseStatCard`, `AuthCardHeader`, `LanguageSwitcher`. Use Nuxt UI (`UButton`, `UBadge`, `UModal`, `USelect`) for controls; there is no `BaseButton` or `BaseBadge`.
- `composables/` — `useAppErrorMessage` (AppError and legacy error text), `useLocaleFormat` (money and dates in the UI locale), `useFormModal`, `useStoreAction` (legacy stores only).
- `session/` — `tenant.store` (selected kindergarten), `actor.store` + `actor.types` (signed-in user, role, module grants).
- `permissions/` — `permission-policy.ts` (pure rules) and `usePermissions`.
- `schemas/` — Zod schemas shared by forms and server routes.
- `types/` — `Result`, `ScreenStatus`, page meta typing.
- `utils/` — `calendarDate`, `generatePassword`, `staffFilters` (moves to `modules/staff` in spec step 7).
```

If P2 is not merged, remove `calendarDate` from the `utils/` line.

- [ ] **Step 2: Commit**

```bash
git add src/shared/README.md
git commit -m "docs(shared): list the components and helpers that actually exist"
```

---

### Task 6: Record the audit's structural follow-ups in the spec

**Files:**
- Modify: `docs/superpowers/specs/2026-09-13-architecture-refactor-design.md` (append a subsection at the end of §6, before `## 7.`)

- [ ] **Step 1: Insert before the line `## 7. Pilot verification`:**

```markdown
### 6.1 Audit follow-ups (2026-09-14)

The code audit (roadmap `docs/superpowers/plans/2026-09-14-audit-remediation-roadmap.md`) adds these items to existing steps:

- **Step 7, groups:** replace the client-side children-per-group count (`groups.service.ts`, `dashboard.service.ts`) with a `group_children_counts(kindergarten_id)` RPC; needs a migration.
- **Step 7, coupling:** besides A2, `GroupDetailPage` (staff store, children composable), `StaffListPage` (groups composable), `PoolCalendarPage` (children composable) and `PoolTrainerSettingsPage` (groups composable) need ports.
- **Step 7, every module:** delete the pass-through composable; type rows with `Tables<'table'>`; standardize status badge colors on a typed map; one loading pattern per store.
- **Step 7, pool:** split `pool.service.ts` per entity, move `computeOccurrenceDates` to `utils/`, remove the N+1 in `generateMissingSessions`, rewrite `pool.service.test.ts` on `createSupabaseClientFake`.
- **Step 7, attendance:** keep one `AttendanceRecord` type in `types/`; delete the orphan copy.
- **Step 7, auth:** validate `user_modules.module_key` before treating it as `ModuleKey`.
- **Step 8:** extract the duplicated profile-insert and audit-log blocks in `invite.post.ts`.
```

- [ ] **Step 2: Commit, push, PR**

```bash
git add docs/superpowers/specs/2026-09-13-architecture-refactor-design.md
git commit -m "docs(architecture): add the audit follow-ups to the migration plan"
git push -u origin chore/audit-safe-cleanups
gh pr create --base main --head chore/audit-safe-cleanups --title "chore: audit safe cleanups" --body "Audit follow-up (P4). Behavior-neutral: history and banner comments, shared role types, unused exports, one alias style per file, declared direct dependencies, real shared README, audit follow-ups recorded in the refactor spec."
```
