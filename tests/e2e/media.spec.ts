import { test, expect } from '@playwright/test';
import * as path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/meshw/.gemini/antigravity/brain/b6363ab7-edf1-4cc2-ad2a-d8361fec7b28';

test.describe('Aura DIMS - Media Library Milestone Suite', () => {
  test('navigates to Media Library, verifies UI components and upload modal', async ({ page }) => {
    // 1. Sign in as Administrator
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@aurainteract.com');
    await page.locator('input[type="password"]').fill('AuraAdmin#2026');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/(#.*)?$/);

    // 2. Navigate to Content -> Media Library
    await page.getByRole('link', { name: 'Content' }).click();
    await expect(page).toHaveURL(/\/content/);

    // Click Media Library tab
    await page.getByRole('button', { name: 'Media Library', exact: true }).click();
    await expect(page).toHaveURL(/\/content\?tab=media/);

    // Verify search input is present
    await expect(page.getByPlaceholder('Search by title, filename, or tag...')).toBeVisible();

    // Verify filter dropdowns
    await expect(page.locator('select').first()).toBeVisible(); // Media types filter
    await expect(page.getByText('Include archived')).toBeVisible();

    // Verify View Mode toggles (Grid / List)
    const gridBtn = page.getByRole('button', { name: 'Grid View' });
    const listBtn = page.getByRole('button', { name: 'List View' });
    await expect(gridBtn).toBeVisible();
    await expect(listBtn).toBeVisible();

    // Capture screenshot of the Media Library default state
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'media-library-grid.png'), fullPage: true });

    // 3. Open Upload Media Modal
    const uploadBtn = page.getByRole('button', { name: /Upload media|Upload first asset/i }).first();
    await uploadBtn.click();

    // Verify Modal elements
    await expect(page.getByRole('heading', { name: 'Upload Media Asset' })).toBeVisible();
    await expect(page.getByText(/JPEG, PNG \(up to 20 MB\) • MP4 H\.264/i)).toBeVisible();
    await expect(page.getByText(/Departmental digital signage repository • Aurainteract Private Limited/i)).toBeVisible();
    await expect(page.locator('label', { hasText: 'Target Department' })).toBeVisible();
    await expect(page.locator('label', { hasText: 'Title' })).toBeVisible();
    await expect(page.locator('label', { hasText: 'Description' })).toBeVisible();
    await expect(page.locator('label', { hasText: 'Tags' })).toBeVisible();

    // Capture screenshot of the Upload Modal
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'media-upload-modal.png'), fullPage: true });

    // Close upload modal
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Upload Media Asset' })).toHaveCount(0);

    // 4. Switch to List View
    await listBtn.click();
    // In empty state or with assets, list/grid controls toggle seamlessly
    await expect(listBtn).toHaveClass(/bg-white/);

    // 5. Navigate to Dashboard to verify "Recent Content" section
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/(#.*)?$/);
    await expect(page.getByRole('heading', { name: 'Recent Content' })).toBeVisible();
    await expect(page.getByRole('button', { name: /View Media Library/i })).toBeVisible();
  });
});
