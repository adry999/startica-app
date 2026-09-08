# Settings Page — Design Gaps

Reference mockup: `design/mockups/settings_profile_final/screen.png`

---

## Pending

### 1. First Name + Last Name separate fields
**Mockup:** Two inputs side-by-side — "First Name" | "Last Name"  
**Current:** Single "Full Name" input  
**Fix:** Client-side split/join — `fullName.split(/\s+/, 2)` for display, join with space on save. No schema change needed. Edge case: multi-word first names lose the split, but acceptable for V1.

### 2. Email "Verified Primary Email" indicator
**Mockup:** Small green ✓ + teal text "Verified Primary Email" shown below the email field  
**Current:** Info icon + plain grey hint text  
**Fix:** Replace hint with `<span class="flex items-center gap-1 text-xs text-teal-600"><UIcon name="i-heroicons-check-circle" ... /> Verified Primary Email</span>`

### 3. Profile photo upload
**Mockup:** Square photo with camera-icon overlay, "Upload New" + "Remove" buttons  
**Current:** Initials avatar (circle, teal background)  
**Fix:** Supabase Storage upload to `avatars/` bucket, store URL in `users.avatar_url`. Already in the `AuthUser` type (`avatarUrl`). Deferred — agreed to skip for now.

## Out of Scope (V1)
- **Job Title field** — shown in mockup, not in DB schema, not planned for V1
- **Security tab content** (2FA, session management) — mockup shows "Security" nav item, out of V1 scope
- **Preferences tab** — out of V1 scope
- **Billing tab** — out of V1 scope
