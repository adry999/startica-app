import { test, expect } from '@playwright/test'

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Parolă').fill('Startica123!')
  await page.getByRole('button', { name: /autentificare/i }).click()
  await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 })
}

test.describe('kindergartens', () => {
  test('super admin can create, edit, and suspend a kindergarten', async ({ page }) => {
    await login(page, 'admin@startica.dev')

    await page.getByRole('link', { name: 'Grădinițe' }).click()
    await expect(page).toHaveURL('http://localhost:3000/kindergartens')
    await expect(page.getByRole('cell', { name: 'Grădinița Zâna Florilor' })).toBeVisible()

    // Use a timestamp-unique name so repeated local runs don't accumulate
    // duplicate rows and trip Playwright's strict-mode assertions.
    const kName = `Test-${Date.now()}`
    await page.getByRole('button', { name: 'Grădiniță nouă' }).click()
    await page.getByLabel('Nume').fill(kName)
    await page.getByRole('button', { name: 'Salvează' }).click()
    // Nuxt UI's toast renders both a visually hidden aria-live announcer span and the
    // visible toast body with the same text, so getByText() must be scoped to the
    // visible body (exact match) to avoid a strict-mode violation. The toast also
    // auto-dismisses after Nuxt UI's default 5s duration, which races Playwright's
    // default 5s assertion timeout once network latency for the create request is
    // included — give this a wider window than the default.
    await expect(page.getByText('Grădinița a fost creată.', { exact: true })).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('cell', { name: kName })).toBeVisible()

    const newRow = page.getByRole('row', { name: new RegExp(kName) })
    await newRow.getByRole('button', { name: 'Editează' }).click()
    await page.getByLabel('Oraș').fill('Timișoara')
    await page.getByRole('button', { name: 'Salvează' }).first().click()
    await expect(page.getByText('Modificările au fost salvate.', { exact: true })).toBeVisible({ timeout: 8000 })

    await newRow.getByRole('button', { name: 'Suspendă' }).click()
    await page.getByRole('button', { name: 'Confirmă' }).click()
    await expect(newRow.getByText('Suspendată')).toBeVisible()

    await newRow.getByRole('button', { name: 'Reactivează' }).click()
    await page.getByRole('button', { name: 'Confirmă' }).click()
    await expect(newRow.getByText('Activă')).toBeVisible()
  })

  test('a non-super-admin cannot reach /kindergartens', async ({ page }) => {
    await login(page, 'educator.demo@startica.dev')

    await page.goto('/kindergartens')
    await expect(page).toHaveURL('http://localhost:3000/')
  })
})
