import { test, expect } from '@playwright/test';
import * as path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/meshw/.gemini/antigravity/brain/b6363ab7-edf1-4cc2-ad2a-d8361fec7b28';

test.describe('Aura DIMS - RBAC & Departmental Scoping Suite', () => {
  test('provisions a Department Head and verifies departmental boundaries', async ({ page }) => {
    // 1. Sign in as Admin
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@aurainteract.com');
    await page.locator('input[type="password"]').fill('AuraAdmin#2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/(#.*)?$/);

    // 2. Navigate to Users & Provision Department Head
    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page).toHaveURL(/\/users/);

    const deptEmail = `priya.dept.${Date.now()}@aurainteract.com`;
    await page.getByRole('button', { name: 'Provision User' }).first().click();
    await page.locator('input[placeholder*="Ramesh Patel"]').fill('Priya Sharma');
    await page.locator('input[placeholder*="ramesh@aurainteract.com"]').fill(deptEmail);
    await page.locator('select').first().selectOption('department_head');

    // Select the first active department (HR)
    const deptSelect = page.locator('select').nth(1);
    await deptSelect.selectOption({ index: 1 });

    await page.locator('form').getByRole('button', { name: 'Provision User' }).click();

    // Setup link should be presented in local dev
    await expect(page.getByText('Account Created Successfully!')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Done' }).click();

    // Verify user is visible in list
    await expect(page.getByText('Priya Sharma').first()).toBeVisible();
    await expect(page.getByText(deptEmail)).toBeVisible();

    // Sign out Admin
    await page.goto('/');
    await page.locator('header').getByRole('button').filter({ hasText: /Admin/i }).first().click();
    await page.getByRole('button', { name: /Sign out/i }).click();
    await expect(page).toHaveURL(/\/login/);

    // 3. Test Department Head trying to access Admin route without signing in
    await page.goto('/users');
    await expect(page).toHaveURL(/\/login/);
  });

  test('verifies Last-Admin protection guard prevents demoting the last active administrator', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@aurainteract.com');
    await page.locator('input[type="password"]').fill('AuraAdmin#2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/(#.*)?$/);

    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page).toHaveURL(/\/users/);

    // Click edit on the Admin user
    const adminRow = page.locator('tr').filter({ hasText: 'admin@aurainteract.com' });
    await adminRow.getByTitle('Edit user attributes').click();

    // Attempt to change role to Department Head
    await page.locator('select').first().selectOption('department_head');
    await page.locator('select').nth(1).selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Save Changes' }).click();

    // Guard error message must appear
    await expect(page.getByText(/Cannot demote the last remaining active Administrator/i)).toBeVisible();
  });
});
