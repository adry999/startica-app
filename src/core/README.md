# core/ — Infrastructure

- `supabase/` — client.ts + types.ts (generated: `supabase gen types typescript --local > src/core/supabase/types.ts`)
- `powersync/` — schema.ts, connector.ts (Attendance only, later)
- `email/` — Brevo client + vue-email `templates/` + send service. `sendEmail({ template, to, locale, data })`, server-side only.
- `i18n/locales/` — ro.json (default) + en.json
- `middleware/` — auth.ts, role.ts (route guards)
