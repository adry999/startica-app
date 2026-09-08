import { test, expect } from '@playwright/test'

test.describe('staff critical flows', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Email').fill('admin@startica.dev')
    await page.getByLabel('Parolă').or(page.getByLabel('Password')).fill('Startica123!')
    await page.getByRole('button', { name: /autentificare|log in/i }).click()
    await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 })
  })

  test('invite staff member and verify in list', async ({ page }) => {
    // Navigate to staff
    await page.goto('/staff')
    await page.waitForLoadState('networkidle')

    // Click invite button
    const inviteBtn = page.getByRole('button', { name: /invitare|invite/i }).first()
    await inviteBtn.click()
    await page.waitForLoadState('networkidle')

    // Fill invite form
    const timestamp = Date.now()
    const email = `educator${timestamp}@startica.dev`

    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/prenume|first name/i).fill(`Educator${timestamp}`)
    await page.getByLabel(/nume\b|last name/i).fill('Test')

    // Submit invite
    await page.getByRole('button', { name: /trimite|send/i }).click()
    await page.waitForLoadState('networkidle')

    // Verify staff member appears
    await expect(page.getByText(email)).toBeVisible({ timeout: 5000 })
  })
})
