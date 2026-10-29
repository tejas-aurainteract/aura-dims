import { test, expect } from '@playwright/test';
import * as path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/meshw/.gemini/antigravity/brain/b6363ab7-edf1-4cc2-ad2a-d8361fec7b28';

test.describe('Aura DIMS - Visual Content Creator & Reusable Templates Suite', () => {
  test('full end-to-end authoring lifecycle, templates gallery, canvas editor, and preview simulation', async ({
    page,
  }) => {
    // 1. Sign in as Administrator
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@aurainteract.com');
    await page.locator('input[type="password"]').fill('AuraAdmin#2026');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/(#.*)?$/);

    // 2. Navigate to Content -> Templates
    await page.getByRole('link', { name: 'Content' }).click();
    await expect(page).toHaveURL(/\/content/);

    // Switch to Templates tab
    await page.getByRole('button', { name: 'Templates' }).click();
    await expect(page).toHaveURL(/\/content\?tab=templates/);

    // Wait for templates to load from emulator Firestore
    await expect(page.getByText('Loading template catalog...')).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByText('Operational Notice (Landscape)')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Operational Notice (Portrait)')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Image Poster Showcase (Landscape)')).toBeVisible({ timeout: 15000 });

    // Capture screenshot: templates-gallery.png
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'templates-gallery.png'),
      fullPage: true,
    });

    // 3. Instantiate template into a new design
    const useTemplateBtns = page.getByRole('button', { name: 'Use Template' });
    await useTemplateBtns.first().click();

    // Verify template instantiation dialog
    await expect(page.getByRole('heading', { name: 'Create Design from Template' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Open in Visual Editor' }).click();

    // 4. Verify Visual Design Editor loaded
    await expect(page).toHaveURL(/\/content\/editor\//, { timeout: 15000 });
    await expect(page.getByText('Loading Visual Content Creator...')).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByText('5% Safe Display Zone')).toHaveCount(0);

    // Verify Save status pill
    await expect(page.getByText(/Saved|Saving/i).first()).toBeVisible({ timeout: 10000 });

    // Toggle 5% Safe Zone overlay
    const safeZoneBtn = page.getByTitle('Toggle 5% Safe Display Margin');
    await safeZoneBtn.click();
    await expect(page.getByText('5% Safe Display Zone')).toBeVisible();

    // 5. Add a Text element from the toolbar
    const textMenuBtn = page.getByRole('button', { name: 'Text' });
    await textMenuBtn.click();
    await page.getByRole('button', { name: /Heading/i }).first().click();

    // Verify text element appeared on canvas
    await expect(page.locator('div[data-element-type="text"]').first()).toBeVisible();

    // 6. Add a Shape element
    const shapeMenuBtn = page.getByRole('button', { name: 'Shapes' });
    await shapeMenuBtn.click();
    await page.getByRole('button', { name: 'Rounded Rectangle' }).click();
    await expect(page.locator('div[data-element-type="shape"]').first()).toBeVisible();

    // Capture screenshot: landscape-editing.png
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'landscape-editing.png'),
      fullPage: true,
    });

    // 7. Fullscreen Display Simulation Preview
    const previewBtn = page.getByRole('button', { name: 'Preview', exact: true });
    await previewBtn.click();

    // Verify simulation modal
    await expect(page.getByText('Aura DIMS Display Simulation')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Slide 1 of/i)).toBeVisible();

    // Capture screenshot: full-design-preview.png
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'full-design-preview.png'),
      fullPage: true,
    });

    // Exit preview modal
    await page.getByTitle('Exit Preview').click();
    await expect(page.getByText('Aura DIMS Display Simulation')).toHaveCount(0);

    // 8. Exit editor back to Content -> Designs
    await page.getByTitle('Back to Designs').click();
    await expect(page).toHaveURL(/\/content\?tab=designs/, { timeout: 15000 });

    // Verify design appears in catalog
    await expect(page.getByPlaceholder('Search designs by title...')).toBeVisible({ timeout: 10000 });

    // 9. Create a Blank Portrait design
    await page.getByRole('button', { name: 'Create content' }).click();
    await expect(page.getByRole('heading', { name: 'Create Content' })).toBeVisible();

    // Select "Start from Blank"
    await page.getByRole('heading', { name: 'Start from Blank' }).click();
    await expect(page.getByRole('heading', { name: 'Start from Blank Canvas' })).toBeVisible();

    // Fill title & select Portrait
    await page.getByPlaceholder('e.g. Lobby Welcoming Announcement').fill('Entrance Totem Notice (Portrait)');
    await page.getByRole('button', { name: /Portrait/i }).click();
    await page.getByRole('button', { name: 'Open Visual Editor' }).click();

    // Verify Portrait Editor loaded
    await expect(page).toHaveURL(/\/content\/editor\//, { timeout: 15000 });
    await expect(page.getByText('Loading Visual Content Creator...')).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByText(/Portrait \(1080×1920\)|Portrait/i)).toBeVisible();

    // Add multilingual Gujarati / Hindi text
    await page.getByRole('button', { name: 'Text' }).click();
    await page.getByRole('button', { name: /ગુજરાતી શીર્ષક/i }).click();

    // Capture screenshot: portrait-editing.png
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'portrait-editing.png'),
      fullPage: true,
    });

    // Exit back to dashboard
    await page.getByTitle('Back to Designs').click();
    await page.getByRole('link', { name: 'Dashboard' }).click();

    // Verify Dashboard has Recent Visual Designs
    await expect(page.getByRole('heading', { name: 'Recent Visual Designs' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Entrance Totem Notice (Portrait)').first()).toBeVisible();
  });
});
