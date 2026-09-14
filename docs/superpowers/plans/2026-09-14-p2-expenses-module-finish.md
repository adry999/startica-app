# P2 — Finish the Expenses Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the already-written expenses refactor (spec step 7, first module) so the Expenses page on `main` works again, and enforce its module boundary.

**Architecture:** The migration follows the billing/payments pilot: injected service factory returning `Result<T, AppError>`, a setup store with screen status and latest-request guards, modal components on Nuxt UI v3, and a public `index.ts`. The code sits uncommitted in `.worktrees/expenses-module` (branch `refactor/expenses-module`). This plan extracts one duplicated helper, runs the gates, commits in two steps (refactor, then boundary enforcement) and opens the PR.

**Tech Stack:** Nuxt 3.21, Vue 3.5, Pinia 3, Supabase JS 2, Nuxt UI 3, Zod 4, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-13-architecture-refactor-design.md` §6 step 7 · audit report https://claude.ai/code/artifact/ed5a70e1-2e16-43e9-b87b-937cc791489c · `.claude/skills/project-conventions/SKILL.md` rules 2–8 · roadmap `docs/superpowers/plans/2026-09-14-audit-remediation-roadmap.md`.

## Global Constraints

- Conventional Commits; no AI/agent mention; no `Co-Authored-By`.
- File moves and behavior changes never share a commit; every commit leaves lint, typecheck, tests and build green; run the gates sequentially.
- A module counts as migrated only when its name is in `boundaryEnforcedModules` on `main`; it is removed from `components.dirs` and `imports.dirs` in the same commit.
- Nuxt UI v3 only (`UModal v-model:open` + `#content`, `UButton`, `UBadge`, `USelect :items`).

## State of the worktree before starting

`git -C D:\CODE\startica\app\.worktrees\expenses-module status --short` must show exactly these changes (anything else: stop and report):

```
 M src/core/i18n/locales/en.json
 M src/core/i18n/locales/ro.json
D  src/modules/expenses/composables/useExpenses.ts
 M src/modules/expenses/pages/ExpensesListPage.vue
 M src/modules/expenses/services/expenses.service.test.ts
 M src/modules/expenses/services/expenses.service.ts
 M src/modules/expenses/stores/expenses.store.ts
 M src/modules/expenses/types/expenses.types.ts
 M src/plugins/module-dependencies.ts
?? src/modules/expenses/README.md
?? src/modules/expenses/components/
?? src/modules/expenses/expenses.dependencies.ts
?? src/modules/expenses/index.ts
?? src/modules/expenses/stores/expenses.store.test.ts
```

Before Task 1, bring the branch up to date: `git -C D:\CODE\startica\app\.worktrees\expenses-module fetch origin` then `git -C D:\CODE\startica\app\.worktrees\expenses-module rebase --autostash origin/main`. Resolve any locale conflict by keeping both sides' keys.

## File Structure

- Create `src/shared/utils/calendarDate.ts` — `todayAsCalendarDate(now?: Date): string`.
- Create `src/shared/utils/calendarDate.test.ts`.
- Modify `src/modules/payments/components/RecordPaymentModal.vue` — import the helper.
- Modify `src/modules/expenses/components/RecordExpenseModal.vue` (uncommitted) — import the helper.
- Commit the expenses module files listed in Task 2.
- Modify `eslint.config.mjs`, `nuxt.config.ts`, `src/pages/expenses.vue`, `.claude/skills/project-conventions/SKILL.md`, `docs/superpowers/specs/2026-09-13-architecture-refactor-design.md` in Task 3.

---

### Task 1: Share the local calendar-date helper

**Files:**
- Create: `src/shared/utils/calendarDate.ts`
- Test: `src/shared/utils/calendarDate.test.ts`
- Modify: `src/modules/payments/components/RecordPaymentModal.vue:19-24`

**Interfaces:**
- Produces: `todayAsCalendarDate(now: Date = new Date()): string` returning `YYYY-MM-DD` from local date parts.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { todayAsCalendarDate } from './calendarDate'

describe('todayAsCalendarDate', () => {
  it('uses the local calendar day even just after local midnight', () => {
    expect(todayAsCalendarDate(new Date(2026, 8, 1, 0, 30))).toBe('2026-09-01')
  })

  it('pads single-digit months and days', () => {
    expect(todayAsCalendarDate(new Date(2026, 0, 5, 12, 0))).toBe('2026-01-05')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/utils/calendarDate.test.ts`
Expected: FAIL — cannot find module `./calendarDate`.

- [ ] **Step 3: Write the implementation**

```ts
// A Postgres `date` is a calendar day: build it from local parts, not from the UTC day of toISOString().
export function todayAsCalendarDate(now: Date = new Date()): string {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map(part => String(part).padStart(2, '0'))
    .join('-')
}
```

In `src/modules/payments/components/RecordPaymentModal.vue` delete:

```ts
function todayAsCalendarDate(): string {
  const now = new Date()
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map(part => String(part).padStart(2, '0'))
    .join('-')
}
```

and add after `import { paymentMethods, type PaymentInput } from '@shared/schemas/payment.schema'`:

```ts
import { todayAsCalendarDate } from '@shared/utils/calendarDate'
```

In `src/modules/expenses/components/RecordExpenseModal.vue` delete:

```ts
// expense_date is a calendar date: build it from local parts, not the UTC day of toISOString().
function todayAsCalendarDate(): string {
  const now = new Date()
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map(part => String(part).padStart(2, '0'))
    .join('-')
}
```

and add after `import { expenseCategories, type ExpenseInput } from '@shared/schemas/expense.schema'`:

```ts
import { todayAsCalendarDate } from '@shared/utils/calendarDate'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/utils/calendarDate.test.ts src/modules/payments`
Expected: PASS.

- [ ] **Step 5: Commit (payments + helper only; the expenses modal ships in Task 2)**

```bash
git add src/shared/utils/calendarDate.ts src/shared/utils/calendarDate.test.ts src/modules/payments/components/RecordPaymentModal.vue
git commit -m "refactor(shared): share the local calendar-date helper"
```

---

### Task 2: Commit the expenses refactor

**Files:** everything listed in "State of the worktree", plus the modal edit from Task 1.

**Interfaces:**
- Produces (public, `src/modules/expenses/index.ts`): `expensesDependenciesKey: InjectionKey<ExpensesDependencies>`, `createExpensesService(client: SupabaseClient<Database>): ExpensesService`.
- `ExpensesService`: `listExpenses(kindergartenId)`, `getSummary(kindergartenId)`, `recordExpense(input, actorId)`, `approveExpense({ expenseId, kindergartenId, actorId })`, `rejectExpense({ expenseId, kindergartenId, actorId, reason })`, each `Promise<Result<T, AppError>>`; approve/reject refuse with `{ kind: 'refused', reason: 'expense_not_draft' }`.

- [ ] **Step 1: Run the unit tests**

Run: `npx vitest run src/modules/expenses src/shared src/plugins`
Expected: PASS (`expenses.service.test.ts` 18 tests, `expenses.store.test.ts` 13 tests).

- [ ] **Step 2: Run the full gates in order**

```bash
npx nuxi prepare
npx vitest run
npm run lint
npm run typecheck
npm run build
```
Expected: all green, lint 0 errors.

- [ ] **Step 3: Confirm no raw legacy components remain in the module**

Run: `grep -rnE "BaseButton|BaseBadge|UModal v-model=|toISOString|ro-RO|as Record<string, unknown>" src/modules/expenses`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/modules/expenses src/plugins/module-dependencies.ts src/core/i18n/locales/en.json src/core/i18n/locales/ro.json
git status --short
git commit -m "refactor(expenses): inject a guarded service into a screen-state store" -m "Approve and reject now match only a live draft of the selected kindergarten and refuse with expense_not_draft. The store exposes loading, ready, empty and failed, drops stale responses, tracks pending decisions per row and refreshes totals after every change. The page moves to Nuxt UI v3 components and locale-aware formatting; the pass-through useExpenses composable is removed."
```

Expected `git status --short` before the commit: only staged (`A`/`M`/`D`) paths, no ` M` or `??` lines.

---

### Task 3: Enforce the expenses boundary

**Files:**
- Modify: `eslint.config.mjs:7`
- Modify: `nuxt.config.ts` (remove 3 lines)
- Modify: `src/pages/expenses.vue:2`
- Modify: `.claude/skills/project-conventions/SKILL.md` (migration status row)
- Modify: `docs/superpowers/specs/2026-09-13-architecture-refactor-design.md:4` (status line)

- [ ] **Step 1: Plant a boundary violation and confirm lint currently allows it**

Create `src/modules/expenses/boundary-probe.ts`:

```ts
import { billingDependenciesKey } from '@modules/billing'

export const boundaryProbe = billingDependenciesKey
```

Run: `npx eslint src/modules/expenses/boundary-probe.ts`
Expected: exit 0 — a legacy module may still import another module's public index; only deep imports into enforced modules are rejected.

- [ ] **Step 2: Enforce the module**

In `eslint.config.mjs` replace:
```js
const boundaryEnforcedModules = ['billing', 'payments']
```
with:
```js
const boundaryEnforcedModules = ['billing', 'expenses', 'payments']
```

In `nuxt.config.ts` delete these three lines:
```ts
      '~/modules/expenses/components',
```
```ts
      'modules/expenses/composables',
```
```ts
      'modules/expenses/stores',
```

In `src/pages/expenses.vue` replace:
```ts
import ExpensesListPage from '~/modules/expenses/pages/ExpensesListPage.vue'
```
with:
```ts
import ExpensesListPage from '@modules/expenses/pages/ExpensesListPage.vue'
```

- [ ] **Step 3: Confirm the planted violation now fails, then delete it**

Run: `npx nuxi prepare && npx eslint src/modules/expenses/boundary-probe.ts`
Expected: exit 1 with `no-restricted-imports` — "A module never imports another module…".

Run: `rm src/modules/expenses/boundary-probe.ts`

- [ ] **Step 4: Record the step**

In `.claude/skills/project-conventions/SKILL.md` replace:
```markdown
| Boundary lint (`boundaryEnforcedModules` in `eslint.config.mjs`) | enforced: `billing`, `payments` (step 4) |
```
with:
```markdown
| Boundary lint (`boundaryEnforcedModules` in `eslint.config.mjs`) | enforced: `billing`, `payments` (step 4), `expenses` (step 7) |
```

In `docs/superpowers/specs/2026-09-13-architecture-refactor-design.md` replace the line starting `**Status:**` with:
```markdown
**Status:** Steps 1–6 merged to `main` (#12, #15, #16). Step 7 in progress: `expenses` migrated (branch `refactor/expenses-module`); remaining modules not started. Steps 8–11 not started.
```

- [ ] **Step 5: Run the full gates in order**

```bash
npx vitest run
npm run lint
npm run typecheck
npm run build
```
Expected: all green. `git status --short` shows no `boundary-probe.ts`.

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs nuxt.config.ts src/pages/expenses.vue .claude/skills/project-conventions/SKILL.md docs/superpowers/specs/2026-09-13-architecture-refactor-design.md
git commit -m "build(lint): enforce the expenses module boundary"
```

---

### Task 4: Open the PR

- [ ] **Step 1: Push**

Run: `git push -u origin refactor/expenses-module`

- [ ] **Step 2: Create the PR**

```bash
gh pr create --base main --head refactor/expenses-module --title "refactor(expenses): migrate the expenses module to the module conventions" --body "Spec step 7, first module. Fixes the audit's critical expenses findings: non-existent BaseButton/BaseBadge, v2 UModal API, approve/reject not scoped to a live draft of the kindergarten, stale totals after approval. Manual check: as admin, record an expense, approve one draft, reject another with a reason, confirm the totals update and that a second approve of the same expense shows 'no longer a draft'."
```

- [ ] **Step 3: Watch CI**

Run: `gh pr checks --watch`
Expected: `Typecheck · Lint · Test` pass. The user merges.

- [ ] **Step 4: After the user merges, clean up the worktree**

```powershell
$worktree = "D:\CODE\startica\app\.worktrees\expenses-module"
$junction = Join-Path $worktree 'node_modules'
if ((Get-Item $junction -Force).LinkType -eq 'Junction') { [System.IO.Directory]::Delete($junction, $false) }
git -C "D:\CODE\startica\app" worktree remove $worktree
git -C "D:\CODE\startica\app" branch -d refactor/expenses-module
```

If `.output` exists in the worktree (from `npm run build`), delete its symlinks first without following them — see `project_architecture_refactor.md` memory gotcha — before removing the worktree.
