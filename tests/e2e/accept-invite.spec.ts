/**
 * E2E test: accept-invite flow
 *
 * Strategy:
 *  1. Create the invited user via the Supabase admin invite endpoint; the email
 *     lands in Mailpit (the local SMTP capture server).
 *  2. Insert the matching row in public.users so fetchCurrentUser() can build
 *     the app profile.
 *  3. Fetch the invite email from Mailpit, extract the Supabase verify URL, and
 *     follow it via Node.js fetch to exchange the OTP for session tokens
 *     (access_token + refresh_token).  This avoids two Windows-specific
 *     network problems in Playwright's Chromium:
 *       a) Browser navigation to port 54321 (Supabase) triggers a redirect to
 *          http://127.0.0.1:3000 which Chromium cannot reach because the Nuxt
 *          dev server binds only to ::1 (IPv6 "localhost"), not 127.0.0.1 IPv4.
 *       b) @supabase/ssr's createBrowserClient hard-codes flowType:"pkce" and
 *          throws when it encounters the implicit-flow #access_token= hash.
 *  4. Call GET /auth/v1/user with the access_token (from Node.js) to get the
 *     full user object needed to build the session cookie.
 *  5. Serialise the session as JSON, encode it with base64url, and set the
 *     "sb-127-auth-token" cookie in a fresh browser context before navigating
 *     to /accept-invite.  The Supabase browser client reads the cookie via
 *     _recoverAndRefresh(); getUser() then validates the JWT server-side.
 *  6. Fill the set-password form → assert redirect to the dashboard.
 */
import { test, expect } from '@playwright/test'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
// Fallback is the well-known local-stack service-role key (printed by `supabase start`).
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// supabase/config.toml site_url (used for the invite redirect_to).
const SUPABASE_SITE_URL = 'http://127.0.0.1:3000'

// The origin Playwright's Chromium CAN reach (Nuxt binds to ::1 = "localhost").
const APP_ORIGIN = 'http://localhost:3000'

// Mailpit captures all emails sent by the local Supabase stack.
const MAILPIT_URL = 'http://127.0.0.1:54324'

// UUID of the seeded Super Admin (see supabase/seed.sql).
const SUPER_ADMIN_ID = '11111111-1111-1111-1111-111111111111'

// Cookie name: @supabase/supabase-js derives it as
//   `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`
// → hostname = "127.0.0.1", first segment = "127" → "sb-127-auth-token"
const AUTH_COOKIE_NAME = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`

/** Shared headers for Supabase admin / REST requests (Node.js fetch). */
function adminHeaders() {
  return {
    'Content-Type': 'application/json',
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  }
}

/**
 * Poll Mailpit until an email to `recipientEmail` appears, then return its ID.
 * Raises after ~10 s if no matching message arrives.
 */
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

/**
 * Given a Mailpit message ID, return the Supabase verify URL embedded in the
 * email HTML body.
 */
async function extractVerifyUrl(messageId: string): Promise<string> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`)
  const data = await res.json() as { HTML: string; Text: string }
  const raw = data.HTML || data.Text || ''
  const match = raw.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify[^\s"<\\)]+/)
  if (!match) throw new Error('Could not find verify URL in invite email')
  return match[0].replace(/\\u0026/g, '&').replace(/&amp;/g, '&')
}

/**
 * Follow the Supabase verify URL with Node.js fetch (redirect: manual) and
 * parse the implicit-flow session tokens from the 303 Location hash.
 * Returns { accessToken, refreshToken, expiresAt, expiresIn }.
 */
async function exchangeInviteToken(verifyUrl: string) {
  const res = await fetch(verifyUrl, { redirect: 'manual' })
  const location = res.headers.get('location') ?? ''
  if (!location.includes('access_token=')) {
    throw new Error(`Supabase did not return session tokens; location: ${location}`)
  }
  // location = "http://127.0.0.1:3000#access_token=…&expires_at=…&refresh_token=…&…"
  const hash = location.split('#')[1] ?? ''
  const params = new URLSearchParams(hash)
  return {
    accessToken: params.get('access_token')!,
    refreshToken: params.get('refresh_token')!,
    expiresAt: parseInt(params.get('expires_at') ?? '0', 10),
    expiresIn: parseInt(params.get('expires_in') ?? '3600', 10),
  }
}

/**
 * Fetch the user object from Supabase using the access token (Node.js fetch).
 */
async function fetchUser(accessToken: string) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) throw new Error(`/auth/v1/user failed: ${res.status}`)
  return res.json()
}

/**
 * Build the base64url-encoded session value that @supabase/ssr stores in the
 * auth cookie: `base64-<base64url(JSON.stringify(session))>`.
 */
function buildCookieValue(session: {
  access_token: string
  refresh_token: string
  expires_at: number
  expires_in: number
  user: unknown
}) {
  const json = JSON.stringify({
    access_token: session.access_token,
    token_type: 'bearer',
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    refresh_token: session.refresh_token,
    user: session.user,
    weak_password: null,
  })
  // Buffer.from is available in Node.js; the browser client uses browser's btoa.
  const encoded = Buffer.from(json, 'utf-8').toString('base64url')
  return `base64-${encoded}`
}

test.describe('accept-invite flow', () => {
  let createdUserId: string | undefined

  test('invited user can set a password and land on the dashboard', async ({ browser }) => {
    // ── 1. Invite the user via the Supabase admin REST API ──────────────────
    const inviteEmail = `invite-e2e-${Date.now()}@example.com`

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
    const userId = inviteData.id
    createdUserId = userId
    expect(userId, 'invite response must include user id').toBeTruthy()

    // ── 2. Create the user profile in public.users ───────────────────────────
    // Verify seed super_admin exists so audit FK doesn't silently fail
    const saRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?id=eq.${SUPER_ADMIN_ID}&select=id`,
      {
        headers: adminHeaders(),
      }
    )
    const saRows = (await saRes.json()) as Array<{ id: string }>
    expect(
      saRows.length,
      `Seed super_admin ${SUPER_ADMIN_ID} not found — run 'supabase db reset'`
    ).toBe(1)

    const profileRes = await fetch(`${SUPABASE_URL}/rest/v1/users`, {
      method: 'POST',
      headers: { ...adminHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        id: userId,
        email: inviteEmail,
        full_name: 'E2E Invitat',
        role: 'educator',
        status: 'active',
        created_by: SUPER_ADMIN_ID,
        updated_by: SUPER_ADMIN_ID,
      }),
    })
    expect(profileRes.ok, `public.users insert failed with ${profileRes.status}`).toBe(true)

    // ── 3. Capture the invite email from Mailpit and extract the verify URL ──
    const messageId = await waitForInviteEmail(inviteEmail)
    const verifyUrl = await extractVerifyUrl(messageId)

    // ── 4. Exchange the OTP for session tokens (Node.js, no browser) ─────────
    const { accessToken, refreshToken, expiresAt, expiresIn } = await exchangeInviteToken(verifyUrl)
    expect(accessToken).toBeTruthy()
    expect(refreshToken).toBeTruthy()

    // ── 5. Fetch the user object (also via Node.js) ──────────────────────────
    const user = await fetchUser(accessToken)
    expect(user.id).toBe(userId)

    // ── 6. Inject the session into a fresh browser context via cookie ─────────
    //    @supabase/ssr stores sessions as:  base64-<base64url(JSON)>
    //    Cookie name = sb-<hostname-first-segment>-auth-token
    //    For SUPABASE_URL = http://127.0.0.1:54321  → "sb-127-auth-token"
    //    Domain must be "localhost" (what the browser sees).
    const cookieValue = buildCookieValue({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      expires_in: expiresIn,
      user,
    })

    const inviteContext = await browser.newContext({ locale: 'ro-RO' })
    await inviteContext.addCookies([
      {
        name: AUTH_COOKIE_NAME,
        value: cookieValue,
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
      },
    ])
    const invitePage = await inviteContext.newPage()

    try {
      // ── 7. Navigate to /accept-invite (clean URL, no hash/code needed) ──────
      //    @supabase/ssr's createBrowserClient reads the session from the cookie
      //    via _recoverAndRefresh(); getUser() then validates the JWT with the
      //    Supabase server and returns the user, so ready.value becomes true.
      await invitePage.goto(`${APP_ORIGIN}/accept-invite`)
      await expect(invitePage).toHaveURL(/\/accept-invite/, { timeout: 10000 })

      // ── 8. Set the password ─────────────────────────────────────────────────
      await expect(invitePage.getByLabel('Parolă nouă')).toBeVisible({ timeout: 10000 })
      await invitePage.getByLabel('Parolă nouă').fill('NewPassword123!')
      await invitePage.getByLabel('Confirmă parola').fill('NewPassword123!')
      await invitePage.getByRole('button', { name: /salvează/i }).click()

      // ── 9. Verify redirect to the dashboard ─────────────────────────────────
      await expect(invitePage).toHaveURL(`${APP_ORIGIN}/`, { timeout: 15000 })
    } finally {
      await inviteContext.close()
    }
  })

  test.afterAll(async () => {
    if (!createdUserId) return

    try {
      // Delete the public.users row
      const usersRes = await fetch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${createdUserId}`,
        {
          method: 'DELETE',
          headers: adminHeaders(),
        }
      )
      if (!usersRes.ok) {
        console.warn(`Failed to delete public.users row: ${usersRes.status}`)
      }
    } catch (err) {
      console.warn('Error deleting public.users row:', err)
    }

    try {
      // Delete the auth user
      const authRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${createdUserId}`,
        {
          method: 'DELETE',
          headers: adminHeaders(),
        }
      )
      if (!authRes.ok) {
        console.warn(`Failed to delete auth user: ${authRes.status}`)
      }
    } catch (err) {
      console.warn('Error deleting auth user:', err)
    }
  })
})
