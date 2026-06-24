# Startica

Multi-tenant kindergarten management SaaS — V1 admin panel (Nuxt 3 + Supabase + PowerSync).

## Quick start
1. Read `GETTING_STARTED.md` (step-by-step kickoff).
2. `CLAUDE.md` holds the rules Claude Code reads every session.
3. Full spec: `docs/Startica_ProjectDocument.docx`. Design system: `docs/Startica_DesignPrompt.md`.

## Stack
Nuxt 3 (Vue 3, SSR, TS strict) · Supabase (Postgres + Auth + Storage, RLS) · PowerSync (offline, later) · Pinia · Tailwind + Nuxt UI · @nuxtjs/i18n (RO default + EN) · Zod · Brevo (email) · Vitest + Playwright.

## Structure
- `src/modules/` — feature modules (auth, kindergartens, dashboard, children, groups, staff, settings)
- `src/shared/` — reusable UI + helpers (no business logic)
- `src/core/` — infrastructure (supabase, powersync, email, i18n, middleware)
- `design/` — Stitch/mockup references (NOT shipped)
- `supabase/` — migrations + seed
- `docs/` — spec + design prompt

> Note: set `srcDir: 'src/'` in `nuxt.config.ts` so Nuxt reads from `src/`.
