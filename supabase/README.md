# supabase/

- `migrations/` — versioned SQL. Every schema change = a new migration.
- `seed.sql` — first Super Admin (bootstrap) + demo kindergarten/groups/children.

## Rules
- Every business table: `kindergarten_id` + `created_at/updated_at/created_by/updated_by` + `deleted_at` + `status`.
- RLS enabled on every table; Super Admin bypass; scope by `user_kindergartens`; reads filter `deleted_at IS NULL`.
- Indexes: composite on `(kindergarten_id, deleted_at)` + FKs.
- After any change: `supabase gen types typescript --local > src/core/supabase/types.ts`.
