import { test, expect } from '@playwright/test'

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  await page.getByLabel('Email').fill('admin.demo@startica.dev')
  await page.getByLabel('Parolă').fill('Startica123!')
  await page.getByRole('button', { name: /autentificare/i }).click()
  await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 })
}

test.describe('admin role', () => {
  test('admin is redirected away from /kindergartens', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/kindergartens')
    await expect(page).toHaveURL('http://localhost:3000/')
  })

  test('admin sees the staff page and their kindergarten staff', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Personal' }).click()
    await expect(page).toHaveURL('http://localhost:3000/staff')
    // Admin's single kindergarten is auto-selected by the layout; wait for data to load
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('cell', { name: 'Elena Popescu' })).toBeVisible({ timeout: 10000 })
  })

  test('admin can invite an educator', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Personal' }).click()
    // Admin's single kindergarten is auto-selected; wait for staff list to be ready
    await expect(page.getByRole('cell', { name: 'Elena Popescu' })).toBeVisible({ timeout: 10000 })

    const uniqueEmail = `admin-invited-${Date.now()}@example.com`
    await page.getByRole('button', { name: 'Invită' }).click()
    const inviteDialog = page.getByRole('dialog')
    await inviteDialog.getByLabel('Email').fill(uniqueEmail)
    await inviteDialog.getByLabel('Nume complet').fill('Educator Nou Admin')
    await inviteDialog.getByRole('button', { name: 'Invită' }).click()
    await expect(page.getByText('Invitația a fost trimisă.', { exact: true })).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('cell', { name: 'Educator Nou Admin' }).first()).toBeVisible()
  })

  test('admin invite dialog does not offer the admin role option', async ({ page }) => {
    await loginAsAdmin(page)
    await page.getByRole('link', { name: 'Personal' }).click()
    // Admin's single kindergarten is auto-selected; wait for Invite button to appear
    await expect(page.getByRole('button', { name: 'Invită' })).toBeVisible({ timeout: 10000 })

    await page.getByRole('button', { name: 'Invită' }).click()
    const inviteDialog = page.getByRole('dialog')

    // The role select must be present — it carries data-testid="role-select"
    const roleSelect = inviteDialog.locator('[data-testid="role-select"]')
    await expect(roleSelect).toBeVisible({ timeout: 5000 })

    // Open the dropdown so the option list is rendered
    await roleSelect.click()

    // Admin must NOT see an 'admin' option in the role picker
    await expect(page.getByRole('option', { name: /^admin$/i })).not.toBeVisible()

    // Close the dialog
    await page.keyboard.press('Escape')
  })
})
