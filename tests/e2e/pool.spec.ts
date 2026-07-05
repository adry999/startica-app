import { test, expect } from '@playwright/test'

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Parolă').fill('Startica123!')
  await page.getByRole('button', { name: /autentificare/i }).click()
  await expect(page).toHaveURL(/http:\/\/localhost:\d+\/$/, { timeout: 10000 })
}

async function selectKindergarten(page: import('@playwright/test').Page) {
  const tenantSelect = page.locator('select').first()
  await expect(tenantSelect).toBeVisible()
  // The @change handler may not be attached until hydration completes, so a
  // too-early selectOption is silently lost — retry until the page reacts.
  await expect(async () => {
    await tenantSelect.selectOption({ label: 'Grădinița Zâna Florilor' })
    await expect(page.getByText('Selectează o grădiniță')).toHaveCount(0, { timeout: 1500 })
  }).toPass({ timeout: 20000 })
}

// Serial: the second test depends on the pattern created in the first.
test.describe.serial('pool', () => {
  test('admin creates an availability window and a pattern, then sees generated sessions', async ({ page }) => {
    await login(page, 'admin@startica.dev')

    await page.goto('/pool/settings')
    await selectKindergarten(page)

    // Add a Monday availability window
    await page.getByRole('button', { name: 'Adaugă interval' }).click()
    const availabilityDialog = page.getByRole('dialog')
    await availabilityDialog.locator('[role="combobox"]').click()
    await page.getByRole('option', { name: 'Luni' }).click()
    await availabilityDialog.getByLabel('Ora început').fill('09:00')
    await availabilityDialog.getByLabel('Ora sfârșit').fill('12:00')
    await availabilityDialog.getByRole('button', { name: 'Adaugă interval' }).click()
    await expect(page.getByText('Luni — 09:00')).toBeVisible({ timeout: 8000 })

    // Add a Monday pattern inside the window, default group Fluturași (2 enrolled
    // children in seed), capacity 2 → generated sessions auto-seed to full.
    const today = new Date().toISOString().slice(0, 10)
    await page.getByRole('button', { name: 'Adaugă tipar' }).click()
    const patternDialog = page.getByRole('dialog')
    await patternDialog.locator('[role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Luni' }).click()
    await patternDialog.getByLabel('Ora început').fill('10:00')
    await patternDialog.getByLabel('Ora sfârșit').fill('11:00')
    await patternDialog.locator('[role="combobox"]').last().click()
    await page.getByRole('option', { name: 'Fluturași' }).click()
    await patternDialog.getByLabel('Capacitate').fill('2')
    await patternDialog.getByLabel('Activ de la').fill(today)
    await patternDialog.getByRole('button', { name: 'Adaugă tipar' }).click()
    await expect(page.getByText(/Luni 10:00/)).toBeVisible({ timeout: 8000 })

    // Calendar page: sessions are generated on read for the next 8 weeks.
    // goto = full reload, the tenant store resets to 'ALL' — reselect.
    await page.goto('/pool')
    await selectKindergarten(page)
    await expect(page.getByText('Locuri: 2/2').first()).toBeVisible({ timeout: 10000 })
  })

  test('a full session blocks enrollment and removing a child reopens it', async ({ page }) => {
    await login(page, 'admin@startica.dev')

    await page.goto('/pool')
    await selectKindergarten(page)
    await expect(page.getByText('Locuri: 2/2').first()).toBeVisible({ timeout: 10000 })

    // Open participants of the first (auto-seeded, full) session
    await page.getByRole('button', { name: 'Vezi participanții' }).first().click()
    const drawer = page.getByRole('dialog')
    await expect(drawer.getByText('Andrei Vasilescu')).toBeVisible({ timeout: 8000 })
    await expect(drawer.getByText('Ioana Marin')).toBeVisible()

    // Full: the add control is replaced by the full-state message
    await expect(drawer.getByText('Sesiunea este completă.')).toBeVisible()
    await expect(drawer.getByRole('button', { name: 'Adaugă copil' })).toHaveCount(0)

    // Removing a child frees a spot and the add control returns
    await drawer.locator('li', { hasText: 'Andrei Vasilescu' }).getByRole('button').click()
    await expect(drawer.getByText('Andrei Vasilescu')).toHaveCount(0, { timeout: 8000 })
    await expect(drawer.getByRole('button', { name: 'Adaugă copil' })).toBeVisible()
  })
})
