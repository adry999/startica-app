# Startica — Audit & Work Log, 2026-09-08

Supersedes the open items in `Startica_Audit_2026-07-04.md`. Companion document:
`Startica_DataImport_2026-09-08.md` (data provenance and open data questions).

**Gate status at end of session:** typecheck 0 errors · eslint 0 errors (22 style
warnings) · 196 tests passing · production build succeeds.

---

## 1. Corrections to the previous audit

Two long-standing items from 2026-07-04 were **already resolved** and should not be
re-investigated:

- **Rule 3 (services are the only DB caller) is clean.** No store or page calls
  `.from()` directly; stores pass `useSupabaseClient()` into a service.
- **The settings module has a service layer** (`settings.service.ts`).

---

## 2. Security

### 2.1 Financial modules were readable and writable by educators (critical)

Invoices, payments and expenses were exposed to any authenticated member of the
kindergarten. Three separate causes:

1. The pages never called `can()`, and `PermissionResource` had no
   `billing`/`payments`/`expenses` values.
2. The sidebar gated them behind `can('read', 'children')`, which returns `true`
   for **every** authenticated role.
3. RLS scoped only by kindergarten membership, with no role condition.

Fixed in `20260908000008_fix_financial_rls.sql` plus a new permission resource and
`middleware: ['role']` on all three routes. Financial data is now Admin /
Super Admin only.

### 2.2 Dead Super Admin check in three migrations

billing / payments / expenses RLS used:

```sql
auth.jwt()->>'role' = 'super_admin'
```

That claim holds the **Postgres** role (`authenticated`), never the app role, so the
branch was dead code and Super Admin silently lost cross-kindergarten access.

> **The project pattern is `public.is_super_admin()`**, alongside
> `public.current_user_role()` and `public.user_kindergarten_ids()`. Use these in
> every new policy.

### 2.3 Hard deletes on financial tables

`for delete` policies existed, contradicting the never-hard-delete rule. Dropped,
`delete` revoked from `authenticated`, and the missing `deleted_at is null` filters
added to the select policies.

---

## 3. Defects found and fixed

Ordered roughly by how much they were costing.

### 3.1 The whole app rendered empty — no kindergarten existed

Every page gates on `tenantStore.selectedKindergartenId`, which is populated from
the first kindergarten the user can read. The linked project had **zero**
kindergartens, so nothing rendered anywhere. Two earlier migrations guarded on "a
kindergarten must already exist" and therefore applied as silent no-ops.

Bootstrapped in `20260908000013`.

### 3.2 Guardian inserts always failed (PL/pgSQL has no short-circuit)

`assert_related_tenant_matches()` guarded its children branch with:

```sql
if TG_TABLE_NAME = 'children' and new.group_id is not null then
```

PL/pgSQL hands that entire condition to the SQL executor as **one expression**, so
`new.group_id` is resolved regardless of the table comparison. On `guardians` and
`parents` the NEW record has no `group_id`, so every insert aborted with `42703`
— including inserts made through the UI.

> **Rule:** when one trigger function serves several tables, use a **nested** `IF`
> for the table check. Never rely on `and` to short-circuit.

Fixed in `20260908000012`.

### 3.3 Ambiguous PostgREST embeds silently join the wrong column

`public.user_kindergartens` has **two** foreign keys to `public.users` (`user_id`
and `created_by`). `user_kindergartens!inner(...)` is therefore ambiguous, and
PostgREST resolved it via `created_by` — joining each user to rows *they created*
rather than their memberships. The staff list and two dashboard counts read 0.

It stayed hidden while `created_by` was null everywhere; populating it exposed it.

> **Rule:** always pin the constraint —
> `user_kindergartens!user_kindergartens_user_id_fkey!inner(...)`.
> `public.groups` has *three* FKs to `users` (`educator_id`, `created_by`,
> `updated_by`), so the same care applies there.

### 3.4 Detail pages rendered "not found" (asyncData payload loss)

Both `ChildProfilePage` and `GroupDetailPage` did:

```ts
const child = ref<Child | null>(null)
useLazyAsyncData(key, async () => { child.value = await fetchById(id) })
```

Only the **asyncData payload** is serialised into the SSR response. A separate
local ref is not, so on hydration it resets to `null` — and because the handler
already has cached data for that key it **never re-runs on the client**. The record
was lost every time.

> **Rule:** the record must *be* the payload —
> `const { data: child } = useLazyAsyncData(...)`.

`GroupDetailPage` had a second cause: the group fetch shared a handler with
`fetchByGroup` and `staffStore.fetchAll`, so a rejection in either sibling blanked
the whole payload. Auxiliary fetches now live in their own keyed calls.

### 3.5 asyncData callbacks returning `undefined`

Sixteen callbacks resolved to `undefined`. Nuxt treats that as "no payload" and
refetches on the client, duplicating every request; the dev server warned on each
page load. Two shapes were responsible:

```ts
async () => { kg.value && await fetchAll(kg.value) }          // brace body discards the value
() => kg.value ? fetchAll(kg.value) : Promise.resolve()        // falsy branch → undefined
```

All now return an explicit value. Warnings went from one per page load to **zero**.

### 3.6 Store actions returning `undefined` instead of a result

Both were hidden behind `@ts-ignore`:

- `children.store.fetchById` returned nothing on success (it only wrote into
  `items`), so `if (result) child.value = result` was dead code.
- `guardians.store.create` returned nothing while its siblings `update`/`remove`
  return `boolean`, so `if (ok)` never fired and **adding a guardian showed no
  confirmation at all**.

### 3.7 Financial totals under-reported by 161,200 lei

`getSummary` selected every expense row and summed them in JS. **PostgREST caps a
response at 1000 rows by default**, so past that the totals silently under-report
with no error. With 1201 rows imported the UI showed 1,402,859 lei against an
actual 1,564,059.

Replaced with a `public.expense_summary()` aggregate
(`20260908000017`), `security invoker` so RLS still scopes the caller.

> **Rule:** never aggregate money by summing a `select *` client-side.

### 3.8 Reactivity lost in financial composables

`useBilling` / `usePayments` / `useExpenses` returned `store.items` directly, which
detaches state from the store. The pages then read `items.value` on an unwrapped
array — which is *why* they carried `@ts-ignore`. All three now use `storeToRefs`.

### 3.9 AttendancePage could not compile

Two `:class` bindings on one element (`Duplicate attribute`). It only surfaced once
the import fix made the page actually resolve. Its status colours were also built
as `` `bg-${opt.color}-600` `` — Tailwind scans for **literal** class strings, so
those classes were never generated and the buttons would have rendered unstyled.

### 3.10 i18n

- `"pool"` was declared **twice** as a top-level key in both locales; JSON keeps
  the last, so a whole block was silently discarded (the two disagreed on ~19
  strings).
- `nav.pool` / `nav.payroll` were missing, so the sidebar rendered the literal
  strings `nav.pool` and `nav.payroll`.
- `billing` declared **literal dotted keys** (`"status.draft"`) instead of nested
  objects, so vue-i18n's path lookup failed; `filter` and `status` were each
  simultaneously a string label and a namespace. Renamed to
  `filterLabel` / `statusLabel`.

Locales are now at parity (454 = 454 keys) with no duplicates.

### 3.11 Route wiring

`billing`, `payments`, `expenses` and `attendance` referenced `Lazy*ListPage`, but
`~/modules/*/pages` is **not** a registered components dir — only `*/components`.
The pages silently failed to resolve and rendered empty.

> **Rule:** import module pages explicitly, as `src/pages/children/index.vue` does.

---

## 4. Features added

- **Mobile navigation.** The sidebar was a fixed `w-64` column with no small-screen
  handling. It is now an off-canvas drawer below `lg` (hamburger, backdrop, Escape,
  route-change dismissal, body-scroll lock) and unchanged from `lg` up.
- **Rows per page.** `BasePagination` gained a 10 / 25 / 50 / 100 / **All**
  selector. `'all'` is modelled as a literal, not a sentinel number, and resolved
  through a `resolvedPageSize` computed. Only the children list consumes it so far;
  staff, billing and kindergartens can adopt it with `v-model:page-size`.
- **Kindergarten avatar upload** (storage bucket + RLS + settings UI).
- **Zod schemas for payments and expenses**, enforced at the service boundary, with
  amounts rejected beyond 2 decimal places rather than silently rounded by Postgres.
- **Expense rejection flow** — the Reject button previously set an id and did
  nothing else.
- **Accessibility** — nav landmarks, `aria-current`, labelled search and logout,
  decorative icons hidden.
- **Build** — vendor chunk splitting; the SSR build previously died with
  `Fatal process out of memory` and now needs `--max-old-space-size=4096`.

---

## 5. Environment gotchas worth remembering

- **Nuxt auto-imports do not exist under vitest.** Stores and components must
  import `useAuthStore` / `useI18n` explicitly or their tests throw.
- **Zod v4 `.uuid()` enforces RFC-4122** version and variant nibbles, so
  `11111111-1111-1111-1111-111111111111` is rejected. Use real v4 UUIDs in fixtures.
- **`public.children` enforces** `birth_date BETWEEN '1990-01-01' AND CURRENT_DATE`.
- **A new enum value cannot be used in the transaction that adds it** — split
  `alter type ... add value` and the inserts into two migrations.
- `supabase db query --linked -f file.sql` is the way to inspect the hosted
  database; passing SQL inline gets mangled by PowerShell quoting.

---

## 6. Still open

| # | Item | Notes |
|---|------|-------|
| 1 | 22 eslint **warnings** | style only (attribute order, self-closing tags) |
| 2 | No tests in 6 modules | children, groups, dashboard, settings, billing, attendance |
| 3 | No Zod schema for billing or attendance | payments/expenses now have one |
| 4 | Pagination not adopted | staff, billing, kindergartens still render unpaginated tables |
| 5 | Kindergarten name is a placeholder | "Gradinita Startica" — rename in Settings |
| 6 | GDPR `retention_until` unenforced | stored, but nothing acts on it |
| 7 | Largest client chunk 485 KB | after splitting; build needs the raised heap |
| 8 | Reports module | paused earlier by request |

Data-side open questions are tracked in `Startica_DataImport_2026-09-08.md`.

---

## 7. Commits (this session)

```
3ba3f82  feat(expenses): import the real expense ledger, aggregate totals in Postgres
a14c3a0  fix(data): correct 8 children imported with swapped first/last name
8ba99d4  fix: child and group detail pages rendered "not found"
4a237f7  refactor: clear all eslint errors (20 -> 0)
b399cbe  feat(ui): add rows-per-page control to BasePagination
34c850c  fix: make asyncData callbacks return a value, repair children fetchById
88347b7  fix: green the test suite and disambiguate user_kindergartens embeds
fbdf052  fix(db): repair guardian tenant trigger, bootstrap kindergarten and roster
0e65562  feat(layout): add mobile navigation drawer
4ede171  feat(financial): add Zod schemas, tests, and fix reactivity bug
532cb06  fix(i18n): remove duplicate pool key, add missing nav keys
f8e3a79  fix(security): restrict financial modules to admin/super-admin
b982b2e  perf(build): split vendor chunks and raise build heap
2023df1  a11y: improve admin layout accessibility
9429917  feat(settings): add kindergarten avatar upload
```

### Migrations added

| Migration | Purpose |
|---|---|
| `20260908000008_fix_financial_rls` | financial data → Admin/Super Admin only |
| `20260908000012_fix_guardians_tenant_trigger` | guardian inserts no longer fail |
| `20260908000013_bootstrap_kindergarten_and_roster` | kindergarten, staff, groups, 104 children |
| `20260908000014_fix_swapped_child_names` | 8 children with reversed names |
| `20260908000015_expense_category_pool` | adds the `pool` category |
| `20260908000016_import_expenses` | 1201 expense rows |
| `20260908000017_expense_summary_function` | server-side money aggregate |
