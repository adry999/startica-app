/**
 * E2E test: accept-invite flow
 *
 * Strategy:
 *  1. Create the invited user via the Supabase admin invite endpoint; the email
 *     lands in Mailpit (the local SMTP capture server).
 *  2. Insert the matching row in public.users so fetchCurrentUser() can build
 *     the app profile.
 *  3. Fetch the invite email from Mailpit, extract the Supabase verify URL, and
 *     follow it via Node.js fetch to get the implicit-flow redirect (which
 *     contains the #access_token= hash in the Location header).
 *  4. Navigate the browser directly to /accept-invite with that hash appended.
 *     AcceptInvitePage.vue's onMounted handler detects the hash and calls
 *     supabase.auth.setSession() — this is the real production code path.
 *  5. Fill and submit the set-password form → assert redirect to the dashboard.
 *
 * Windows IPv4/IPv6 note:
 *  The Supabase verify URL redirects to http://127.0.0.1:3000#… but the Nuxt
 *  dev server binds only to ::1 (IPv6 "localhost"). We extract the hash in
 *  Node.js and navigate the browser to http://localhost:3000/accept-invite#…
 *  so Chromium reaches the server correctly.
 */
import { test, expect } from '@playwright/test'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

const SUPABASE_SITE_URL = 'http://127.0.0.1:3000'
const APP_ORIGIN = 'http://localhost:3000'
const MAILPIT_URL = 'http://127.0.0.1:54324'

const SUPER_ADMIN_ID = '11111111-1111-1111-1111-111111111111'

function adminHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  }
}

async function waitForInviteEmail(recipientEmail: string): Promise<string> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=20`)
    const data = await res.json() as {
      messages: Array<{ ID: string; To: Array<{ Address: string }> }>
    }
    const match = data.messages.find(
      (m) => m.To.some((t) => t.Address === recipientEmail),
    )
    if (match) return match.ID
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`Timed out waiting for invite email to ${recipientEmail}`)
}

async function extractVerifyUrl(messageId: string): Promise<string> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`)
  const data = await res.json() as { HTML: string; Text: string }
  const raw = data.HTML || data.Text || ''
  const match = raw.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify[^\s"<\\)]+/)
  if (!match) throw new Error('Could not find verify URL in invite email')
  return match[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&')
}

/**
 * Follow the Supabase verify URL with Node.js fetch and return the implicit-flow
 * hash fragment (e.g. "#access_token=…&refresh_token=…&type=invite").
 */
async function extractInviteHash(verifyUrl: string): Promise<string> {
  const res = await fetch(verifyUrl, { redirect: 'manual' })
  const location = res.headers.get('location') ?? ''
  if (!location.includes('access_token=')) {
    throw new Error(`Supabase did not return session tokens; location: ${location}`)
  }
  const hashIndex = location.indexOf('#')
  if (hashIndex === -1) throw new Error('No hash fragment in redirect location')
  return location.slice(hashIndex) // "#access_token=…"
}

test.describe('accept-invite flow', () => {
  let createdUserId: string | undefined

  test.afterAll(async () => {
    if (!createdUserId) return
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${createdUserId}`, {
        method: 'DELETE',
        headers: adminHeaders(),
      })
    } catch { /* cleanup is best-effort */ }
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createdUserId}`, {
        method: 'DELETE',
        headers: adminHeaders(),
      })
    } catch { /* cleanup is best-effort */ }
  })

  test('invited user can set a password and land on the dashboard', async ({ page }) => {
    const inviteEmail = `invite-e2e-${Date.now()}@example.com`

    // ── 1. Verify seed super_admin exists (guard for audit FK) ───────────────
    const saRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${SUPER_ADMIN_ID}&select=id`, {
      headers: adminHeaders(),
    })
    const saRows = await saRes.json() as Array<{ id: string }>
    expect(saRows.length, `Seed super_admin ${SUPER_ADMIN_ID} not found — run 'supabase db reset'`).toBe(1)

    // ── 2. Invite the user via the Supabase admin REST API ───────────────────
    const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({
        email: inviteEmail,
        redirect_to: `${SUPABASE_SITE_URL}/accept-invite`,
      }),
    })
    expect(inviteRes.ok, `invite API call failed with ${inviteRes.status}`).toBe(true)
    const inviteData = await inviteRes.json() as { id: string }
    createdUserId = inviteData.id
    expect(createdUserId, 'invite response must include user id').toBeTruthy()

    // ── 3. Create the user profile in public.users ───────────────────────────
    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: createdUserId,
        email: inviteEmail,
        full_name: 'E2E Invitat',
        role: 'educator',
        status: 'active',
        created_by: SUPER_ADMIN_ID,
        updated_by: SUPER_ADMIN_ID,
      }),
    })
    expect(profileRes.ok, `public.users insert failed with ${profileRes.status}`).toBe(true)

    // ── 4. Capture invite email and extract the Supabase verify URL ──────────
    const messageId = await waitForInviteEmail(inviteEmail)
    const verifyUrl = await extractVerifyUrl(messageId)

    // ── 5. Exchange the OTP for the implicit-flow hash (Node.js fetch) ───────
    const inviteHash = await extractInviteHash(verifyUrl)
    expect(inviteHash).toContain('access_token=')

    // ── 6. Navigate to /accept-invite with the real implicit-flow hash ────────
    //    AcceptInvitePage.vue's onMounted() reads window.location.hash and calls
    //    supabase.auth.setSession() — this is the real production code path.
    await page.goto(`${APP_ORIGIN}/accept-invite${inviteHash}`)
    await expect(page).toHaveURL(/\/accept-invite/, { timeout: 10000 })

    // ── 7. Set the password ──────────────────────────────────────────────────
    await expect(page.getByLabel('Parolă nouă')).toBeVisible({ timeout: 10000 })
    await page.getByLabel('Parolă nouă').fill('NewPassword123!')
    await page.getByLabel('Confirmă parola').fill('NewPassword123!')
    await page.getByRole('button', { name: /salvează/i }).click()

    // ── 8. Verify redirect to the dashboard ─────────────────────────────────
    await expect(page).toHaveURL(`${APP_ORIGIN}/`, { timeout: 15000 })
  })
})
