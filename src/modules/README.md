# modules/

Each module is self-contained with the same shape:

```
<module>/
├── components/   # module-specific Vue components
├── composables/  # use*.ts — reusable UI logic
├── stores/       # *.store.ts — Pinia state (public API of the module)
├── services/     # *.service.ts — ONLY layer that calls Supabase/PowerSync
├── types/        # *.types.ts
└── pages/        # routed pages
```

Modules: **auth, kindergartens, dashboard, children, groups, staff, settings**.
Cross-module communication goes through public stores or `shared/` — never a direct import.
