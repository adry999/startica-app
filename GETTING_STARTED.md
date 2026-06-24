# Startica — Getting Started (Final Kickoff Guide)

The single step-by-step guide from "planning done" to "first features shipped". Pair it with `CLAUDE.md` (the rules Claude Code reads every session) and `Startica_ProjectDocument` (the full spec). This file is the **sequence**; those are the **reference**.

---

## 0. Prerequisites

Install once:
- **Node.js** LTS (≥ 20) + **npm**
- **Claude Code** — `npm install -g @anthropic-ai/claude-code`
- **Supabase CLI** — for local dev (`npm i -g supabase` or scoop/brew)
- **Docker Desktop** — Supabase local stack runs in Docker (you're on Windows — make sure Docker + WSL2 are running)
- **Git** + a GitHub repo
- **Brevo account** — for email (free tier), get an SMTP key + API key later
- **(Optional) Figma desktop app** — only if you adopt the Figma MCP path (needs a Dev/Full seat for real use)

---

## 1. Create the repo & Nuxt project

```bash
npx nuxi@latest init startica
cd startica
git init && git add -A && git commit -m "chore: init nuxt"
```

Set TypeScript to strict in `nuxt.config.ts` / `tsconfig.json`.

---

## 2. Drop in the planning artifacts

Put these at the repo root so Claude Code has full context:
- **`CLAUDE.md`** → repo root (Claude Code reads it automatically every session)
- `Startica_ProjectDocument.docx` → `docs/` (reference)
- `Startica_DesignPrompt.md` → `docs/` (reference)

```bash
mkdir docs design
# copy CLAUDE.md to root, the rest into docs/
git add -A && git commit -m "docs: add planning artifacts + CLAUDE.md"
```

---

## 3. Create the folder structure

```
src/
├── modules/        auth/ kindergartens/ dashboard/ children/ groups/ staff/ settings/
│                   (each: components/ composables/ stores/ services/ types/ pages/)
├── shared/         ui/ composables/ utils/ types/ schemas/
├── core/           supabase/ powersync/ email/ i18n/ middleware/
└── layouts/        default.vue auth.vue admin.vue

design/             # NOT shipped — Stitch HTML, mockup screenshots, Figma exports (reference only)
public/             # static assets served as-is: logo, favicon
assets/images/      # build-processed images (Nuxt Image)
supabase/           # migrations/ seed.sql
docs/               # project document, design prompt
```

Tell Claude Code: *"Set up this folder structure and wire module pages into Nuxt routing via `nuxt.config.ts` (components.dirs + imports.dirs), per CLAUDE.md."*

---

## 4. Supabase — database first

```bash
supabase init
supabase start          # local Postgres in Docker
```

Then, in order:
1. **Schema migrations** — create tables with the cross-cutting foundations (every business table: `kindergarten_id`, `created_at/updated_at/created_by/updated_by`, `deleted_at`, `status`). Tables: `kindergartens`, `users`, `user_kindergartens`, `groups`, `children`, `parents`, `audit_logs`.
2. **RLS policies** — enable on every table; Super Admin bypass; scope by `user_kindergartens`; always `AND deleted_at IS NULL`.
3. **Triggers** — `updated_at` auto-update; `audit_logs` writes.
4. **Indexes** — composite on `(kindergarten_id, deleted_at)` and FKs (`group_id`, `educator_id`).
5. **Seed** (`supabase/seed.sql`) — the **first Super Admin** (bootstrap) + a demo kindergarten with a couple of groups, children, and an educator so you build against real data.
6. **Generate types**:
   ```bash
   supabase gen types typescript --local > src/core/supabase/types.ts
   ```

Prompt Claude Code: *"Write the initial migration, RLS policies, triggers, indexes, and seed per the schema in CLAUDE.md and the project document. One migration file."*

---

## 5. Core infrastructure (before any feature)

Build in this order — features depend on it:
1. **Supabase client** (`core/supabase/client.ts`)
2. **Tailwind + Nuxt UI** + the **palette tokens** (from `Startica_DesignPrompt.md`) as CSS variables / Tailwind theme
3. **i18n** (`@nuxtjs/i18n`, RO default + EN, `core/i18n/locales/`)
4. **Auth** (`modules/auth`) — login, session, `core/middleware/auth.ts` + `role.ts`
5. **Permissions helper** — `can(action, resource)` / `usePermissions` (resource-level, role-pluggable — see CLAUDE.md "Future roles")
6. **Tenant store** — `useTenantStore` (selected kindergarten / 'ALL') + `KindergartenSwitcher.vue` in the top bar
7. **Email service** (`core/email`) — Brevo via custom SMTP + vue-email templates (can wait until invitations)
8. **Shared UI** — `Base*` components used everywhere

---

## 6. Design assets & handoff workflow

**Recommended (solo, fast, free):**
1. Run the design prompt (`Startica_DesignPrompt.md`) in **Stitch** → generate screens in 2–3 batches (start: Login + Dashboard + Groups).
2. Export screenshots (and HTML if you want) into `design/` as **reference only** — never paste Stitch HTML as production code.
3. Have Claude Code build each screen in the real stack (Nuxt UI + Tailwind + your `Base*` components + palette), using the screenshot as visual reference.
4. **Screenshot-compare-refine loop:** build → run dev → screenshot → compare to the mockup → ask Claude Code to adjust.

**Optional (later, pixel-fidelity):** Figma MCP path
- Needs Figma desktop app + a **Dev/Full seat** (free tier ≈ 6 tool calls/month).
- Setup: `claude mcp add --transport http figma https://mcp.figma.com/mcp`, then `/mcp` → Authenticate. (Or `claude plugin install figma@claude-plugins-official`.)
- Keep the Figma file **clean**: auto layout + variables matching the palette + named components. Use **Code Connect** so Claude reuses your real components.
- Select a frame / paste its link → *"Build this as a Vue component using our stack and `Base*` components."*
- Add Figma→code rules to `CLAUDE.md` so output stays consistent (reuse our components, Tailwind, palette tokens — don't invent values).

**Where assets live:** `design/` = reference (not shipped) · `public/` = logo/favicon · `assets/images/` = optimized images · Supabase Storage = user uploads (avatars, child photos).

---

## 7. Build order (modules)

Follow the roadmap from the project document:
- **M0 (wk 1):** core infra (Supabase, auth, i18n, middleware, tenant store, permissions) + seed
- **M1 (wk 2–3):** Kindergartens + Groups + Children (CRUD, RLS, fish profile, parents)
- **M2 (wk 4):** Staff (invite by email, roles) + Settings (password, language)
- **M3 (wk 5):** Dashboard (stats per kindergarten / 'ALL'), UI polish, full i18n
- **M4 (wk 6):** Testing pass, bugfix, deploy, user docs
- **Later:** Attendance (PowerSync, PWA) · parent/child roles · payments

Build one module fully (CRUD + tests + i18n + states) before the next — the patterns repeat.

---

## 8. Definition of done (every feature)

- [ ] In V1 scope (Must)
- [ ] New table → `kindergarten_id` + standard columns + soft delete + RLS
- [ ] Queries scoped to selected kindergarten + `deleted_at IS NULL`
- [ ] Permission checks via `can()`
- [ ] No hardcoded strings (i18n RO + EN)
- [ ] Service is the only DB caller; all fetching via `useAsyncData`
- [ ] Vitest for new utils/services/composables; Playwright for critical flows
- [ ] Types regenerated after schema change
- [ ] Loading + error + empty states handled

---

## Commands cheat sheet

```bash
# Dev
npm run dev | build | preview | lint | typecheck | test

# Supabase
supabase start | stop | db reset
supabase migration new <name>
supabase gen types typescript --local > src/core/supabase/types.ts

# Claude Code (optional Figma)
claude mcp add --transport http figma https://mcp.figma.com/mcp
```

---

## First prompt to Claude Code

> Read `CLAUDE.md` and `docs/Startica_ProjectDocument`. Set up the folder structure (modules/shared/core), wire module routing in `nuxt.config.ts`, install Tailwind + Nuxt UI + @nuxtjs/i18n, and configure the palette tokens from `docs/Startica_DesignPrompt.md`. Then write the initial Supabase migration (schema + RLS + triggers + indexes) and `seed.sql` (first super admin + demo kindergarten). Don't build features yet — just the foundation. Follow the cross-cutting rules in CLAUDE.md.
