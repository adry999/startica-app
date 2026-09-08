import { test, expect } from '@playwright/test'

test.describe('children critical flows', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Email').fill('admin@startica.dev')
    await page.getByLabel('Parolă').or(page.getByLabel('Password')).fill('Startica123!')
    await page.getByRole('button', { name: /autentificare|log in/i }).click()
    await expect(page).toHaveURL('http://localhost:3000/', { timeout: 10000 })
  })

  test('create child → edit → change status to withdrawn', async ({ page }) => {
    // Navigate to children page
    await page.goto('/children')
    await page.waitForLoadState('networkidle')

    // Click add child button
    await page.getByRole('button', { name: /adaugă|add/i }).first().click()
    await page.waitForLoadState('networkidle')

    // Fill form
    const timestamp = Date.now()
    const firstName = `Test${timestamp}`
    const lastName = 'Child'

    await page.getByLabel(/prenume|first name/i).fill(firstName)
    await page.getByLabel(/nume\b|last name/i).fill(lastName)
    await page.getByLabel(/dată de naștere|birth date/i).fill('2020-01-15')

    // Submit form
    await page.getByRole('button', { name: /salvează|save/i }).click()
    await page.waitForLoadState('networkidle')

    // Verify child appears in list
    await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible({ timeout: 5000 })

    // Click to view child profile
    await page.getByText(`${firstName} ${lastName}`).first().click()
    await page.waitForLoadState('networkidle')

    // Verify profile page
    await expect(page.getByText(`${firstName} ${lastName}`)).toBeVisible()

    // Edit profile: change name
    const editButton = page.getByRole('button', { name: /editează|edit/i }).first()
    await editButton.click()
    await page.waitForLoadState('networkidle')

    const newFirstName = `Updated${timestamp}`
    await page.getByLabel(/prenume|first name/i).fill(newFirstName)
    await page.getByRole('button', { name: /salvează|save/i }).click()
    await page.waitForLoadState('networkidle')

    // Verify update
    await expect(page.getByText(/actualizat|updated/i)).toBeVisible()
    await expect(page.getByText(`${newFirstName} ${lastName}`)).toBeVisible({ timeout: 5000 })

    // Change status to withdrawn
    const statusButton = page.getByRole('button', { name: /schimbă statut|change status/i }).first()
    if (await statusButton.isVisible()) {
      await statusButton.click()
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: /retras|withdrawn/i }).click()
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(/retras|withdrawn/i)).toBeVisible()
    }
  })

  test('add guardian contact to child', async ({ page }) => {
    // Navigate to children list
    await page.goto('/children')
    await page.waitForLoadState('networkidle')

    // Open first child's profile
    const childRow = page.locator('[role="row"]').nth(1)
    await childRow.click()
    await page.waitForLoadState('networkidle')

    // Click add guardian button
    const addGuardianBtn = page.getByRole('button', { name: /adaugă tutore|add guardian/i })
    await addGuardianBtn.click()
    await page.waitForLoadState('networkidle')

    // Fill guardian form
    const timestamp = Date.now()
    await page.getByLabel(/prenume|first name/i).fill(`Parent${timestamp}`)
    await page.getByLabel(/nume\b|last name/i).fill('Guardian')
    await page.getByLabel(/email/i).fill(`parent${timestamp}@test.local`)
    await page.getByLabel(/telefon|phone/i).fill('+40721234567')

    // Submit
    await page.getByRole('button', { name: /adaugă|add/i }).last().click()
    await page.waitForLoadState('networkidle')

    // Verify guardian appears
    await expect(page.getByText(/adăugat|added/i)).toBeVisible()
    await expect(page.getByText(`Parent${timestamp}`)).toBeVisible({ timeout: 5000 })
  })
})
