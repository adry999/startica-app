# Auth Module — Design

## Context

Startica's foundation (Nuxt 3, Tailwind + Nuxt UI, i18n, Supabase client, initial schema + RLS + seed) is in place. The `users`/`auth.users` tables, RLS policies, and `@supabase/ssr`-based client (`src/core/supabase/client.ts`) already exist from the foundation pass. This is the next module per `GETTING_STARTED.md`'s "core infra" build order: **Auth only** — login, session, logout, password reset, route guards. The permissions helper (`can()`/`usePermissions`) and the tenant store (`useTenantStore` + `KindergartenSwitcher`) are explicitly out of scope for this pass — they are the next two steps in the sequence, built separately once Auth is working end-to-end.

The Dashboard module doesn't exist yet, so there is no real "after login" destination page. Rather than scaffold a placeholder `/dashboard` route prematurely, the existing `src/pages/index.vue` becomes the temporary authenticated landing page (greeting + role + logout) and will be replaced wholesale when the Dashboard module is built.

No login mockup exists in `design/mockups/` (the Stitch batch covered dashboard/children/groups/staff/settings/localization, not login). The login screen is built from the textual spec in `docs/Startica_DesignPrompt.md` directly, using the already-implemented Tailwind/Nuxt UI palette tokens — not the slightly different hex values found in `design/mockups/startica_core/DESIGN.md`, since `docs/Startica_DesignPrompt.md` is the documented source of truth for the palette (CLAUDE.md).

## Goal

A user can log in with email/password, stay authenticated across SSR navigations via cookie-based sessions, log out, request a password reset email, and set a new password from the emailed link. Unauthenticated users are redirected to `/login` for any other route; authenticated users are redirected away from the login/forgot-password pages.

## Out of scope (explicitly deferred)

- `can(action, resource)` / `usePermissions` — `role.ts` middleware does a direct role check against `route.meta.roles` for now, not the generic permission abstraction. This is acceptable because the rule CLAUDE.md protects against is scattering `role === 'X'` checks across **components** — a single check inside one middleware file is not that.
- `useTenantStore` / `KindergartenSwitcher.vue` — no kindergarten selection exists yet; nothing in this module depends on it.
- Staff invitation flow, `core/email/` (Brevo) wiring — password reset emails are sent by Supabase Auth directly; in local dev they land in Mailpit (`http://127.0.0.1:54324`) regardless of SMTP config. Configuring real Brevo SMTP is a deployment-time concern, not Auth module code.
- Dashboard module / sidebar+topbar `admin.vue` layout / `KindergartenSwitcher` — `index.vue` stays a plain placeholder behind auth.

## Architecture

New dependency: `pinia` + `@pinia/nuxt` (not yet installed — required for `auth.store.ts`).

```
src/core/middleware/auth.ts        # real logic: defineNuxtRouteMiddleware, session + redirect rules
src/core/middleware/role.ts        # real logic: defineNuxtRouteMiddleware, checks to.meta.roles
src/middleware/auth.global.ts      # thin re-export — Nuxt only auto-discovers middleware/*.ts
src/middleware/role.ts             # thin re-export — named, opt-in via definePageMeta({ middleware: ['role'] })

src/shared/schemas/auth.schema.ts  # Zod: loginSchema, requestPasswordResetSchema, updatePasswordSchema

src/modules/auth/types/auth.types.ts       # AuthUser, LoginCredentials
src/modules/auth/services/auth.service.ts  # only layer calling supabase.auth.*
src/modules/auth/stores/auth.store.ts      # Pinia: user, session, isAuthenticated
src/modules/auth/composables/useAuth.ts    # public API for pages: login(), logout(), requestPasswordReset(), updatePassword()
src/modules/auth/pages/LoginPage.vue
src/modules/auth/pages/ForgotPasswordPage.vue
src/modules/auth/pages/ResetPasswordPage.vue

src/layouts/auth.vue                # centered card layout for public auth pages

src/pages/login.vue                 # thin route -> renders LoginPage
src/pages/forgot-password.vue       # thin route -> renders ForgotPasswordPage
src/pages/reset-password.vue        # thin route -> renders ResetPasswordPage
src/pages/index.vue                 # updated: "Hi, {full_name} ({role})" + logout button

src/core/i18n/locales/ro.json       # new auth.* keys
src/core/i18n/locales/en.json       # new auth.* keys

nuxt.config.ts                      # add '@pinia/nuxt' to modules
```

**Why thin files in `src/pages/` and `src/middleware/`:** Nuxt only auto-discovers routes from `pages/` and middleware from `middleware/` — there's no `components.dirs`/`imports.dirs`-equivalent for either. The thin file in `src/pages/login.vue` imports and renders `LoginPage.vue` from the module; the real logic stays in `modules/auth/`. This is Nuxt-routing plumbing, not a module import, so it doesn't violate "modules never import from each other directly."

### Data flow (per CLAUDE.md)

`LoginPage.vue` (component) → `useAuth()` (composable) → `auth.store.ts` (Pinia) → `auth.service.ts` (service) → Supabase Auth.

## Flows

### Login (`/login`, layout `auth`, `definePageMeta({ public: true, guestOnly: true })`)

1. Form validated with `loginSchema` (email: valid email; password: min 1 — Supabase enforces the real minimum server-side, the client just checks presence).
2. `useAuth().login(email, password)` → store action → `auth.service.signInWithPassword()` → `createSupabaseBrowserClient().auth.signInWithPassword()`. The `@supabase/ssr` browser client writes the auth cookies itself, in the format the server client reads on the next SSR navigation — no custom server route needed.
3. On success, the store fetches the matching `public.users` row (role, full_name, status) via the service and populates state.
4. Redirect to the `redirect` query param if present (deep-link-then-login), else `/`.
5. On failure, show a translated inline error (`auth.invalidCredentials`) — never reveal whether the email exists.

### Logout

`useAuth().logout()` → `auth.service.signOut()` → `supabase.auth.signOut()` → clear the store → redirect `/login`.

### Forgot password (`/forgot-password`, layout `auth`, `definePageMeta({ public: true, guestOnly: true })`)

1. Single email field, validated with `requestPasswordResetSchema`.
2. `auth.service.requestPasswordReset(email)` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${origin}/reset-password\` })`.
3. Always show the same success message regardless of whether the email exists (`auth.forgotPasswordSuccess`) — matches Supabase Auth's own behavior, which doesn't leak account existence either.

### Reset password (`/reset-password`, layout `auth`, `definePageMeta({ public: true })` — **not** `guestOnly`, since the user arrives with an active recovery session from the emailed link)

1. On mount, confirm a session exists (Supabase establishes the recovery session from the URL automatically); if there's no session at all, show an "invalid or expired link" state with a link back to `/forgot-password`.
2. Form with new password + confirmation, validated with `updatePasswordSchema` (password: min 6, matching `supabase/config.toml`'s `auth.minimum_password_length`; `confirmPassword` must match via `.refine`).
3. `auth.service.updatePassword(newPassword)` → `supabase.auth.updateUser({ password })`.
4. On success, redirect straight to `/` (already has an active session — no need to go through `/login`).

## Middleware & guards

`src/middleware/auth.global.ts` (thin) → `src/core/middleware/auth.ts` (real), runs on every navigation, server and client:

- Resolves the current session once per navigation (`createSupabaseServerClient(event)` server-side via `useRequestEvent()`, `createSupabaseBrowserClient()` client-side) and syncs the auth store.
- `to.meta.public !== true` and no session → redirect `/login?redirect=<to.fullPath>`.
- `to.meta.guestOnly === true` and a session exists → redirect `/`.
- Otherwise, proceed.

`src/middleware/role.ts` (thin, named) → `src/core/middleware/role.ts` (real), opt-in per page via `definePageMeta({ middleware: ['role'], roles: ['admin', 'super_admin'] })`:

- Reads `to.meta.roles: UserRole[]`. If the current user's role isn't in the list, redirect `/` (no admin/staff pages exist yet to exercise this — it's wired and ready for the Kindergartens/Staff modules).

## i18n

New keys in `ro.json` / `en.json` under `auth.*`: `loginTitle`, `submit`, `invalidCredentials`, `forgotPasswordTitle`, `forgotPasswordSubmit`, `forgotPasswordSuccess`, `resetPasswordTitle`, `resetPasswordSuccess`, `resetPasswordInvalidLink`, `newPassword`, `confirmPassword`, `passwordMismatch`, `logout`, `welcomeBack`, `role.superAdmin`, `role.admin`, `role.educator`. Zod schemas stay locale-agnostic (structural only); components map known Zod issue codes/paths to translated strings rather than using Zod's raw English messages.

## UI

Centered card on `bg-app-bg`, max-width ~400px, `rounded-card` (Nuxt UI default `UCard`). Text wordmark "Startica" (no graphic logo exists in `public/` yet) in `text-teal-700` bold above the form title. Inputs and the primary button are plain Nuxt UI components (`UInput`, `UButton color="primary"`) — they already resolve to the teal/slate tokens via `app.config.ts`. Language switcher (RO/EN) in the top-right corner of the card, consistent with the design prompt's login screen description.

## Error handling

- Invalid credentials, network errors, and Supabase rate-limit responses on login all collapse to the same generic `auth.invalidCredentials` message — no detail leakage.
- Forgot-password always shows success regardless of outcome (see above).
- Reset-password: expired/invalid recovery link → dedicated state, not a raw Supabase error string.
- All service calls are typed to return a discriminated result (`{ success: true, data }` / `{ success: false, error }`) rather than throwing, so pages don't need try/catch sprawl.

## Testing

- Vitest: `auth.schema.ts` validation cases (valid/invalid email, password length, mismatched confirm-password); `auth.store.ts` state transitions on login/logout success and failure (service mocked).
- Playwright: full login → land on `/` → see greeting → logout → redirected to `/login`; unauthenticated visit to `/` redirects to `/login?redirect=/`; forgot-password submit shows the generic success state.

## Definition of done

- [ ] Login, logout, forgot-password, reset-password all work end-to-end against the local Supabase stack (seeded `admin@startica.dev` / `Startica123!`).
- [ ] Unauthenticated access to any non-public route redirects to `/login` with a `redirect` param; returning there after login lands back on the original route.
- [ ] Authenticated access to `/login` or `/forgot-password` redirects to `/`.
- [ ] No hardcoded user-facing strings — everything through the new `auth.*` i18n keys, RO + EN.
- [ ] `auth.service.ts` is the only file calling `supabase.auth.*`.
- [ ] Vitest passing for schema + store; Playwright passing for the flows above.
- [ ] `npm run build` and `npx nuxi typecheck` clean.
