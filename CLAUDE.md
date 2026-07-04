# CLAUDE.md — Startica

Context file for Claude Code. Read this fully before working. These rules are project conventions, not suggestions.

---

## Project

Startica is a **multi-tenant kindergarten management SaaS**. This repo is the **V1 admin panel**.

A Super Admin manages all kindergartens; an Admin manages only assigned kindergartens; an Educator sees only their group(s). Each kindergarten owns its groups, children, and staff. Users can belong to multiple kindergartens (many-to-many).

**V1 modules:** auth · kindergartens · dashboard · children · groups · staff · settings
**Deferred (Should Have):** attendance (offline-first with PowerSync)
**Out of scope V1:** parent portal · payments · native mobile · self-service tenant onboarding · messaging

---

## Stack

- **Nuxt 3** (Vue 3, SSR) · **TypeScript** (strict mode)
- **Supabase** — Postgres + Auth + Storage, Row Level Security (RLS)
- **PowerSync** — offline sync (only wired when Attendance is built)
- **Pinia** — client state
- **Tailwind CSS** + **Nuxt UI** — styling & components
- **@nuxtjs/i18n** — RO (default) + EN
- **Zod** — validation, shared client + server
- **Vitest** (unit) · **Playwright** (e2e) — testing is part of V1

---

## Commands

```bash
# App
npm run dev            # dev server
npm run build          # production build
npm run preview        # preview build
npm run lint           # eslint
npm run typecheck      # vue-tsc / nuxi typecheck
npm run test           # vitest

# Supabase (local dev via Docker)
supabase start         # start local stack
supabase stop          # stop local stack
supabase db reset      # reset + re-run migrations + seed
supabase migration new <name>   # new migration
supabase db push       # apply migrations to linked project
supabase gen types typescript --local > src/core/supabase/types.ts   # regen DB types
```

After ANY schema change: create a migration AND regenerate types.

---

## Architecture — Modular Monolith

```
src/
├── modules/        # feature modules, self-contained
│   ├── auth/  kindergartens/  dashboard/  children/  groups/  staff/  settings/
│   │   └── components/ composables/ stores/ services/ types/ pages/
├── shared/         # reusable, NO business logic
│   ├── ui/         # BaseButton, BaseInput, BaseModal, BaseTable, BaseCard, BaseBadge...
│   ├── composables/ utils/ types/ schemas/   # schemas/ = Zod
├── core/           # infrastructure
│   ├── supabase/   # client.ts, types.ts (generated)
│   ├── powersync/  # schema.ts, connector.ts (Attendance only)
│   ├── email/      # provider client, vue-email templates, send service
│   ├── i18n/       # locales/ro.json, en.json
│   └── middleware/ # auth.ts, role.ts
└── layouts/        # default.vue, auth.vue, admin.vue
```

Outside `src/`: `design/` (reference mockups — NOT shipped) · `public/` (logo, favicon) · `assets/images/` (optimized images) · `supabase/` (migrations, seed) · `docs/` (project document, design prompt).

### The 3 rules (do not break)
1. **Modules never import from each other directly.** They communicate via `shared/` or via a module's public store. Keeps modules decoupled.
2. **`shared/ui` has zero business logic.** A `BaseButton` knows nothing about groups or children — props in, events out.
3. **`services/` is the only layer that talks to Supabase/PowerSync.** Components and stores never call the DB directly. Swapping backend = change only `services/`.

### Data flow
```
Component → Composable → Store (Pinia) → Service → Supabase / PowerSync
```
- **Component** — UI + interaction only
- **Composable** — reusable UI logic (e.g. `useGroupForm`)
- **Store** — module global state
- **Service** — backend communication

### Data fetching
**ALL** data fetching goes through Nuxt `useAsyncData` / `useLazyAsyncData` wrapping service calls. No raw `$fetch` / `fetch` in components. Pinia holds state. Do NOT add TanStack Query / Pinia Colada — the asyncData + service + store layer is the single source.

---

## Naming conventions

- **Components:** `PascalCase.vue`. Shared UI prefixed `Base*` (`BaseButton.vue`).
- **Composables:** `use*.ts` (`useChildren.ts`).
- **Stores:** `*.store.ts` (`groups.store.ts`).
- **Services:** `*.service.ts` (`children.service.ts`).
- **Types:** `*.types.ts`. Zod schemas: `*.schema.ts` in `shared/schemas/`.
- **DB:** `snake_case`, tables plural (`children`), FKs `<entity>_id` (`kindergarten_id`).
- **i18n keys:** namespaced per module (`children.form.firstName`).

---

## Cross-cutting rules — NON-NEGOTIABLE

These touch every table and module. Apply from the first migration.

### Multi-tenancy
- Every business table has `kindergarten_id`.
- Every service query respects the selected kindergarten from `useTenantStore`: specific UUID → `.eq('kindergarten_id', id)`; `'ALL'` → no filter (RLS scopes to allowed set anyway).
- `'ALL'` view is Admin/Super Admin only.

### Soft delete
- Never hard-DELETE business data. Set `deleted_at = now()`.
- Every read filters `deleted_at IS NULL` (in RLS and/or query).
- Exception: `audit_logs` is append-only.

### Audit columns (every business table)
- `created_at`, `updated_at` (auto-update trigger), `created_by`, `updated_by` (→ users).

### Time
- All timestamps are `timestamptz`, stored in **UTC**, converted on display per kindergarten timezone.

### Lifecycle / status
- Entities have a `status`, not just delete. children: `enrolled / withdrawn / graduated`; users: `active / inactive`; groups: `active / archived`; kindergartens: `active / suspended`.

### Permissions
- All authorization goes through a single helper: `can(action, resource)` / `usePermissions`. **Never** scatter `if (role === 'ADMIN')` in components.

### Future roles — shape the model now, build later
V2 will likely add `PARENT` (and maybe `CHILD`) roles — e.g. a parent who views/sets their child's data. **Do NOT build parent/child auth now.** But:
- **Data side is cheap to add later** (a nullable `user_id` on the guardian + a `guardian_children` join for one-parent-many-children). Localized to the parents area — don't pre-build it.
- **Authorization is the expensive part to retrofit.** Shape `can(action, resource)` and RLS around **resource-level access** now: "can this user access THIS child / THIS kindergarten", with the access rule **pluggable per role**. Staff scope = by kindergarten; future parent scope = by their children; future child scope = self. Same call sites, different rules.
- Keep `role` an extensible enum; `PARENT` / `CHILD` are reserved future values.
- `parents` rows are contacts in V1, but treat parent **email as natural identity** so a contact can later be promoted to an account cleanly.

### GDPR (children's data, EU)
- `consent` (jsonb) and `retention_until` on children.
- Right-to-erasure = real anonymization (separate service path), NOT soft delete.
- Right-to-access = data export.

### i18n
- No hardcoded user-facing strings. Everything through i18n keys. RO is default.

### Child data model
- **`birth_date` is required** — it's the key field. From it, **derive (never store):** `age` and `zodiac_sign` (computed in a util/composable, since age changes over time).
- **Important stored fields:** `blood_group`, `allergies`, `medical_notes` (these matter more than national ID).
- **`national_id` is OPTIONAL** — field is `national_id` + `id_type` (`CNP` | `IDNP`). Romania = CNP, Moldova = IDNP. When present, `validateNationalId` branches on `id_type`. Never block creating a child for a missing national ID.

---

## Database conventions

- PK = `uuid` default `gen_random_uuid()`.
- RLS enabled on every table. Super Admin bypasses via role check.
- Standard RLS read pattern: `kindergarten_id IN (SELECT kindergarten_id FROM user_kindergartens WHERE user_id = auth.uid()) AND deleted_at IS NULL`.
- `kindergarten_id` is denormalized onto `children` (not only via group) so RLS stays flat/fast. Service guarantees consistency.
- Every schema change → new migration + regenerate types.

---

## Validation
- Zod schemas in `shared/schemas/`, reused on client (forms) and server routes.
- One schema per entity; derive form types from the schema.

---

## Auth & bootstrap
- Supabase Auth (email/password, JWT, refresh, email reset).
- New staff = invite by email (set-password link).
- **First Super Admin** is created via seed SQL (`supabase/seed.sql`) — bootstrap, since no one exists to invite them.

## Email
- **Provider: Brevo** — EU data residency (GDPR-first), multilingual, generous free tier. Chosen because we process children's data in the EU. Abstracted behind `core/email/` — **never call the provider SDK directly** outside this module.
- **Unified pipe:** Supabase Auth routes through Brevo via **custom SMTP**, so auth emails (password reset, confirm) and app emails share one sender + branding.
- **Templates:** **vue-email** components in `core/email/templates/`, rendered to HTML. **Bilingual** — render in the recipient's locale (RO/EN).
- **Service interface:** `sendEmail({ template, to, locale, data })` — the only way to send. **Server-side only** (server routes / Edge Functions), never from the client.
- **V1 email types:** staff invitation, password reset, info/notification.
- **Prerequisite:** verify the sending domain (SPF, DKIM, DMARC) or mail lands in spam.
- **Swap path:** if deliverability needs grow, switch to **Mailgun EU** (still EU residency) by changing only `core/email/` — call sites untouched.
- **Future:** per-kindergarten sender branding.

---

## Definition of done (every feature)
- [ ] In MoSCoW scope (Must for V1)
- [ ] New table → `kindergarten_id` + standard columns + RLS + soft delete
- [ ] Queries scoped to selected kindergarten + `deleted_at IS NULL`
- [ ] Permission checks via `can()`
- [ ] No hardcoded strings (i18n RO + EN)
- [ ] Service is the only DB caller
- [ ] All fetching via `useAsyncData` / `useLazyAsyncData`
- [ ] Tests: Vitest for new utils/services/composables; Playwright for critical flows (login, create child, switch kindergarten)
- [ ] Types regenerated after schema change
- [ ] Loading + error + empty states handled

---

## Design assets & handoff
- **Stitch/mockup HTML is reference only — never paste it as production code.** It won't match Nuxt/Vue/Tailwind. Keep exports + screenshots in `design/`.
- Build screens in the real stack (Nuxt UI + Tailwind + `Base*` components + palette tokens), using mockups as visual reference. Run a screenshot-compare-refine loop.
- **Asset homes:** `design/` = reference (not shipped) · `public/` = logo/favicon · `assets/images/` = optimized images (Nuxt Image) · Supabase Storage = user uploads (avatars, child photos).
- **Palette tokens** come from `design/mockups/startica_core/DESIGN.md` (single design source of truth since 2026-07-02; `docs/Startica_DesignPrompt.md` is superseded for palette/radius/type-scale). Never invent color values — use the defined tokens.
- **Figma MCP (optional, later):** if used, reuse our `Base*` components (via Code Connect), build to our stack, and pull palette from tokens — don't copy raw values like `w-[37px]`.

## Reference docs
- `CLAUDE.md` (this file) — rules, read every session.
- `GETTING_STARTED.md` — step-by-step kickoff sequence.
- `docs/Startica_ProjectDocument` — full spec (modules, schema, multi-tenancy, foundations).
- `docs/Startica_DesignPrompt.md` — design system + palette tokens.
