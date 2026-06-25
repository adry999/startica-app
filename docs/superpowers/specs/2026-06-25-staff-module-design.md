# Staff Module — Design Spec

**Date:** 2026-06-25
**Status:** Approved

---

## Goal

Implement the Staff module for Startica V1: invite staff members by email, list/edit/deactivate staff per kindergarten, and remove them from a kindergarten. Includes an accept-invite page so new staff can set their initial password.

---

## Data Model (no new tables)

Uses three existing tables — no migration needed:

| Table | Role |
|-------|------|
| `public.users` | Staff profile: `full_name`, `email`, `role`, `status`, `avatar_url`, `deleted_at` |
| `public.user_kindergartens` | Kindergarten membership — real DELETE is correct here (schema comment: "removing access is a real DELETE") |

No new enum values. Roles already cover `super_admin`, `admin`, `educator`.

---

## Architecture

### Layer map

```
StaffListPage.vue
  → useStaff() composable
    → useStaffStore() (Pinia)
      → staff.service.ts (reads via user-session client, RLS-scoped)
        → public.users + user_kindergartens (Supabase)
  → $fetch('POST /api/staff/invite')  [invite only]
    → server/api/staff/invite.post.ts (service-role client, bypasses RLS)
      → supabaseAdmin.auth.admin.inviteUserByEmail(...)
      → public.users INSERT (service-role)
      → user_kindergartens INSERT (service-role)
```

### Service layer — `src/modules/staff/services/staff.service.ts`

Uses the standard user-session client (RLS enforced). Returns `Result<T>` throughout.

| Function | Description |
|----------|-------------|
| `listStaff(client, kindergartenId)` | SELECT users via user_kindergartens for the given kindergarten; filters `deleted_at IS NULL` |
| `updateStaffProfile(client, userId, data)` | UPDATE `full_name`, `role`, `updated_by` |
| `setStaffStatus(client, userId, status, actorId)` | UPDATE `status`, `updated_by` |
| `removeFromKindergarten(client, userId, kindergartenId)` | DELETE from `user_kindergartens` |

### Invite server route — `server/api/staff/invite.post.ts`

Server-only. Uses `createSupabaseAdminClient()` (already in `core/supabase/client.ts`, uses `runtimeConfig.supabaseServiceRoleKey`).

**Flow:**
1. Read caller's session via `createSupabaseServerClient(event)` — verify role (`super_admin` or `admin`)
2. Admin extra check: the `kindergartenId` in the body must be in the caller's `user_kindergartens`
3. Validate body with Zod: `{ email, fullName, role, kindergartenId }`
4. Check if `email` already exists in `public.users`:
   - **Yes** → skip invite email; just insert into `user_kindergartens` (idempotent re-add)
   - **No** → call `supabaseAdmin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName, role }, redirectTo: '<NUXT_PUBLIC_SITE_URL>/accept-invite' })`, then INSERT into `public.users` with the returned UUID, then INSERT into `user_kindergartens`
5. Return `{ success: true }` or `{ success: false, error: string }`

`NUXT_PUBLIC_SITE_URL` defaults to `http://localhost:3000` in dev (add to `.env`).

### Accept-invite page — `src/modules/auth/pages/AcceptInvitePage.vue`

Supabase's `detectSessionInUrl: true` (default) auto-exchanges the `?code=` param from the invite link into a session before the component mounts.

- `definePageMeta({ public: true })` — auth middleware must not redirect the arriving user
- On `onMounted`: call `authStore.fetchCurrentUser()` to ensure the session is applied to the store
- If `authStore.user` is null after that → `navigateTo('/login')`
- Shows "Set your password" form: `newPassword` + `confirmPassword` fields (same Zod schema as `ResetPasswordPage`)
- On submit: calls `authStore.updatePassword(newPassword)` → on success → `navigateTo('/')`

---

## Screens

### `/staff` page

**Access:** `super_admin` and `admin` only (role middleware; educators redirected to `/`).

**When `selectedKindergartenId === 'ALL'`:** show an empty-state prompt:
> "Selectează o grădiniță pentru a vedea personalul." / "Select a kindergarten to view staff."

No table, no invite button when no kindergarten is selected.

**When a kindergarten is selected:** show the staff table + "Invită" button (top-right, gated by `can('create', 'staff')`).

### Staff table

| Column | Notes |
|--------|-------|
| Full name | plain text |
| Email | plain text |
| Role | `UBadge` — color: `primary` for admin, `neutral` for educator, `error` for super_admin |
| Status | `UBadge` — `success` for active, `neutral` for inactive |
| Actions | Edit · Deactivate/Reactivate · Remove from kindergarten |

**Action rules:**
- **Edit** (modal): Super Admin can update `full_name` and `role` (any value). Admin can update `full_name` only — the role field is hidden for Admin users. This prevents privilege escalation through editing.
- **Deactivate / Reactivate** (confirm modal): toggles `status` between `active` ↔ `inactive`.
- **Remove from kindergarten** (confirm modal): deletes the `user_kindergartens` row. The user keeps their account and any other kindergarten memberships.

### Invite modal

Fields:
- Email (required, email format)
- Full name (required, min 2 chars)
- Role: Super Admin sees Admin + Educator options; Admin sees Educator only (field is locked/hidden)

On success: toast "Invitația a fost trimisă." / "Invitation sent." — row appears in the table immediately (the user exists in `public.users` even before they accept).

### Tenant selector (admin.vue update)

The selector currently shows only "ALL". For the Staff module (and all future modules that need per-kindergarten scope), it must be functional. Update `admin.vue` to:
1. Call `useKindergartensStore().fetchAll()` on mount (already built; no-op if already loaded)
2. Populate the `USelect` items from `useKindergartensStore().items` — Super Admin sees all; Admin sees only their assigned ones (RLS already scopes this)
3. Keep "Toate" (ALL) as the first option for Super Admin context; Admin defaults to their first kindergarten on load
4. On change: call `useTenantStore().selectKindergarten(id)`

---

## Types — `src/modules/staff/types/staff.types.ts`

```ts
export type StaffMember = {
  id: string
  email: string
  fullName: string
  role: 'super_admin' | 'admin' | 'educator'
  status: 'active' | 'inactive'
  avatarUrl: string | null
}
```

---

## Zod schemas — `src/shared/schemas/staff.schema.ts`

```ts
// used client-side (invite form) and server-side (invite route body validation)
export const inviteStaffSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  role: z.enum(['admin', 'educator']),
  kindergartenId: z.string().uuid(),
})

export const updateStaffSchema = z.object({
  fullName: z.string().min(2),
  role: z.enum(['super_admin', 'admin', 'educator']).optional(), // omitted when caller is Admin
})
```

---

## Permissions — extend `src/shared/composables/usePermissions.ts`

Add `'staff'` to `PermissionResource`. Rules:

| Action | super_admin | admin | educator |
|--------|-------------|-------|----------|
| read | ✓ | ✓ | ✗ |
| create | ✓ | ✓ | ✗ |
| update | ✓ | ✓ | ✗ |
| delete | ✓ | ✓ | ✗ |

(`delete` here means "remove from kindergarten" — not a hard user delete.)

---

## i18n keys

Add `staff.*` namespace to `ro.json` and `en.json`.

**Page / table:**
- `staff.pageTitle`
- `staff.selectKindergarten`
- `staff.empty`
- `staff.invite`
- `staff.inviteTitle`
- `staff.table.name`, `staff.table.email`, `staff.table.role`, `staff.table.status`, `staff.table.actions`

**Fields:**
- `staff.name`, `staff.email`, `staff.role`

**Status labels:**
- `staff.status.active`, `staff.status.inactive`

**Role labels:**
- `staff.role.super_admin`, `staff.role.admin`, `staff.role.educator`

**Action labels / toasts:**
- `staff.inviteSuccess`
- `staff.updateSuccess`
- `staff.confirmDeactivateTitle`, `staff.confirmDeactivateBody`, `staff.deactivateSuccess`
- `staff.confirmReactivateTitle`, `staff.confirmReactivateBody`, `staff.reactivateSuccess`
- `staff.confirmRemoveTitle`, `staff.confirmRemoveBody`, `staff.removeSuccess`

**Accept-invite page (under existing `auth.*`):**
- `auth.acceptInvite.title`, `auth.acceptInvite.subtitle`, `auth.acceptInvite.success`

---

## Files created / modified

| File | Action |
|------|--------|
| `src/modules/staff/types/staff.types.ts` | Create |
| `src/shared/schemas/staff.schema.ts` | Create |
| `src/shared/composables/usePermissions.ts` | Modify — add `'staff'` resource |
| `src/shared/composables/usePermissions.test.ts` | Modify — add staff permission tests |
| `src/modules/staff/services/staff.service.ts` | Create |
| `src/modules/staff/services/staff.service.test.ts` | Create |
| `src/modules/staff/stores/staff.store.ts` | Create |
| `src/modules/staff/stores/staff.store.test.ts` | Create |
| `src/modules/staff/composables/useStaff.ts` | Create |
| `src/modules/staff/pages/StaffListPage.vue` | Create |
| `server/api/staff/invite.post.ts` | Create |
| `src/modules/auth/pages/AcceptInvitePage.vue` | Create |
| `src/pages/staff.vue` | Create — route file |
| `src/pages/accept-invite.vue` | Create — route file (public) |
| `src/layouts/admin.vue` | Modify — populate tenant selector from kindergartens store |
| `src/core/i18n/locales/ro.json` | Modify — add `staff.*` + `auth.acceptInvite.*` |
| `src/core/i18n/locales/en.json` | Modify — add `staff.*` + `auth.acceptInvite.*` |
| `.env` | Modify — add `NUXT_PUBLIC_SITE_URL=http://localhost:3000` |
| `tests/e2e/staff.spec.ts` | Create |

---

## Testing

### Vitest

- `staff.service.test.ts`: list scoped to kindergarten + `deleted_at IS NULL`, `updateStaffProfile` sets `updated_by`, `setStaffStatus` sets `updated_by`, `removeFromKindergarten` deletes the correct row
- `staff.store.test.ts`: fetch/update/setStatus/remove actions; loading + error paths
- `usePermissions.test.ts`: staff resource — super_admin and admin can read/create/update/delete; educator cannot

### Playwright (`tests/e2e/staff.spec.ts`)

1. Admin logs in → selects "Grădinița Zâna Florilor" in tenant selector → navigates to `/staff` → sees the seeded staff list (Maria Ionescu + Elena Popescu)
2. Admin invites a new educator with a timestamp-unique email → row appears in the table
3. Admin deactivates Elena Popescu → badge changes to "Inactiv" → reactivates → badge returns to "Activă"
4. Educator logs in → navigates to `/staff` → redirected to `/` (role guard)

---

## Out of scope for V1

- Avatar upload / profile photo
- Resend invite email
- "Pending invite" status (invited user appears as Active immediately)
- Bulk invite
- Admin escalating another user's role to Admin (Admin can only set Educator)
- Super Admin appearing in the per-kindergarten staff list
