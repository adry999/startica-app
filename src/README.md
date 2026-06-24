# src/ — Modular Monolith

## The 3 rules (do not break)
1. **Modules never import from each other directly** — communicate via `shared/` or a module's public store.
2. **`shared/ui` has zero business logic** — props in, events out.
3. **`services/` is the only layer that talks to Supabase/PowerSync** — components/stores never call the DB directly.

## Data flow
Component → Composable → Store (Pinia) → Service → Supabase / PowerSync

## Folders
- `modules/` — feature modules
- `shared/` — reusable, no business logic
- `core/` — infrastructure
- `layouts/` — default / auth / admin

> `nuxt.config.ts` must set `srcDir: 'src/'` and extend `components.dirs` + `imports.dirs` to pick up module folders.
