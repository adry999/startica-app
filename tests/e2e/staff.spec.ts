import { test, expect } from '@playwright/test'

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Parolă').fill('Startica123!')
  await page.getByRole('button', { name: /autentificare/i }).click()
  await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 })
}

test.describe('staff', () => {
  test('super admin selects a kindergarten and sees the staff list', async ({ page }) => {
    await login(page, 'admin@startica.dev')

    await page.getByRole('link', { name: 'Personal' }).click()
    await expect(page).toHaveURL('http://localhost:3000/staff')

    // With no kindergarten selected, the prompt is shown
    await expect(page.getByText('Selectează o grădiniță pentru a vedea personalul.')).toBeVisible()

    // Select the kindergarten from the tenant selector
    await page.locator('select, [role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Grădinița Zâna Florilor' }).click()

    // Seeded staff should appear
    await expect(page.getByRole('cell', { name: 'Maria Ionescu' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Elena Popescu' })).toBeVisible()
  })

  test('super admin can invite a new educator, deactivate, and reactivate', async ({ page }) => {
    await login(page, 'admin@startica.dev')
    await page.getByRole('link', { name: 'Personal' }).click()

    // Select kindergarten
    await page.locator('select, [role="combobox"]').first().click()
    await page.getByRole('option', { name: 'Grădinița Zâna Florilor' }).click()
    await expect(page.getByRole('cell', { name: 'Elena Popescu' })).toBeVisible()

    // Invite a new educator with a timestamp-unique email
    const uniqueEmail = `test-educator-${Date.now()}@example.com`
    await page.getByRole('button', { name: 'Invită' }).click()
    const inviteDialog = page.getByRole('dialog')
    await inviteDialog.getByLabel('Email').fill(uniqueEmail)
    await inviteDialog.getByLabel('Nume complet').fill('Educator Nou')
    await inviteDialog.getByRole('button', { name: 'Invită' }).click()
    await expect(page.getByText('Invitația a fost trimisă.', { exact: true })).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('cell', { name: 'Educator Nou' }).first()).toBeVisible()

    // Deactivate Elena Popescu
    const elenaRow = page.getByRole('row', { name: /Elena Popescu/ })
    await elenaRow.getByRole('button', { name: 'Dezactivează' }).click()
    await page.getByRole('button', { name: 'Confirmă' }).click()
    await expect(elenaRow.getByText('Inactiv')).toBeVisible()

    // Reactivate Elena Popescu
    await elenaRow.getByRole('button', { name: 'Reactivează' }).click()
    await page.getByRole('button', { name: 'Confirmă' }).click()
    await expect(elenaRow.getByText('Activ', { exact: true })).toBeVisible()
  })

  test('an educator is redirected away from /staff', async ({ page }) => {
    await login(page, 'educator.demo@startica.dev')
    await page.goto('/staff')
    await expect(page).toHaveURL('http://localhost:3000/')
  })
})
