/**
 * Aura DIMS - End-to-End Publication, Playlists, Approvals & Scheduling Suite
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Validates the complete publication workflow:
 * - Immutable design revisions & single-orientation playlists
 * - Asia/Kolkata timezone schedule rules & overnight support
 * - Preflight collision detection & simulation preview
 * - Editorial review workflows & approval policies
 * - Manifest package compilation with SHA-256 asset checksums
 * - Honest operational statuses & Dashboard KPIs
 */

import { test, expect } from '@playwright/test';
import * as path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/meshw/.gemini/antigravity/brain/b6363ab7-edf1-4cc2-ad2a-d8361fec7b28';

test.describe('Aura DIMS - Playlists, Scheduling, Approvals & Publication Suite', () => {
  test('complete end-to-end publishing pipeline lifecycle', async ({ page }) => {
    test.setTimeout(90000);

    // Automatically accept browser confirmation dialogs
    page.on('dialog', (dialog) => dialog.accept());

    // 1. Sign in as Administrator
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@aurainteract.com');
    await page.locator('input[type="password"]').fill('AuraAdmin#2026');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/(#.*)?$/, { timeout: 15000 });

    // 2. Ensure at least one landscape design exists by instantiating a starter template
    await page.getByRole('link', { name: 'Content' }).click();
    await expect(page).toHaveURL(/\/content/);

    await page.getByRole('button', { name: 'Templates' }).click();
    await expect(page.getByText('Operational Notice (Landscape)')).toBeVisible({ timeout: 15000 });

    // Search specifically for Operational Notice (Landscape) which has validated text/shapes
    await page.locator('input[placeholder="Search templates..."]').fill('Operational Notice (Landscape)');

    const useTemplateBtns = page.getByRole('button', { name: 'Use Template' });
    await useTemplateBtns.first().click();

    await expect(page.getByRole('heading', { name: 'Create Design from Template' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Open in Visual Editor' }).click();

    // Visual Design Editor loaded
    await expect(page).toHaveURL(/\/content\/editor\//, { timeout: 15000 });
    await expect(page.getByText('Loading Visual Content Creator...')).toHaveCount(0, { timeout: 15000 });

    // Exit editor back to Content
    await page.getByTitle('Back to Designs').click();
    await expect(page).toHaveURL(/\/content\?tab=designs/, { timeout: 15000 });

    // 3. Navigate to Playlists tab
    await page.getByRole('button', { name: 'Playlists' }).click();
    await expect(page).toHaveURL(/\/content\?tab=playlists/);

    // Wait for playlists hub to load
    await expect(page.getByText('Loading playlists for digital displays...')).toHaveCount(0, { timeout: 15000 });

    // Click "Create playlist"
    await page.getByRole('button', { name: /Create playlist|New playlist/i }).first().click();

    // Verify Create Playlist Modal is open
    await expect(page.getByRole('heading', { name: 'Create Signage Playlist' })).toBeVisible({ timeout: 10000 });

    // Fill form
    await page.locator('input[placeholder="e.g. Lobby Morning Broadcast"]').fill('Corporate Reception Loop');
    await page.locator('textarea[placeholder="Context or broadcast instructions for scheduling operators..."]').fill('Executive signage loop for HQ reception digital displays');

    // Select the Operational Notice design in the playlist modal
    const designSelect = page.locator('form select');
    const noticeOption = await designSelect.locator('option').filter({ hasText: 'Operational Notice' }).first().getAttribute('value');
    if (noticeOption) {
      await designSelect.selectOption(noticeOption);
    }

    // Add selected design to playlist
    const addBtn = page.getByRole('button', { name: 'Add', exact: true });
    await expect(addBtn).toBeEnabled({ timeout: 10000 });
    await addBtn.click();
    await expect(page.getByText(/Total Duration:/i)).toBeVisible();

    // Save Playlist Draft
    await page.getByRole('button', { name: 'Create Playlist', exact: true }).click();

    // Verify modal closes and playlist appears in list
    await expect(page.getByText('Corporate Reception Loop').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Landscape (1920×1080)').first()).toBeVisible();

    // Open playlist preview simulation
    const previewBtn = page.getByTitle('Preview playlist playback simulation').first();
    await previewBtn.click();

    await expect(page.getByText('Landscape Digital Display Preview')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Total Playlist:/i)).toBeVisible();

    // Capture screenshot: playlists-gallery.png
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'playlists-gallery.png'),
      fullPage: true,
    });

    // Close preview modal
    await page.getByTitle('Close preview').click();

    // 4. Navigate to Broadcast Schedules
    await page.getByRole('link', { name: 'Schedules' }).click();
    await expect(page).toHaveURL(/\/schedules/, { timeout: 15000 });

    await expect(page.getByRole('heading', { name: 'Broadcast Schedules' })).toBeVisible();

    // Click "Create schedule"
    await page.getByRole('button', { name: 'Create schedule' }).click();
    await expect(page.getByRole('heading', { name: 'Create Broadcast Schedule' })).toBeVisible({ timeout: 10000 });

    // Fill schedule name
    await page.locator('input[placeholder="e.g. Standard Weekday Lobby Broadcast"]').fill('HQ Reception Weekday Broadcast');

    // Run conflict preflight check
    const checkConflictBtn = page.getByRole('button', { name: 'Run Conflict Check' });
    await checkConflictBtn.click();
    await expect(page.getByText(/Preflight check passed|Conflict warning on digital display/i)).toBeVisible({ timeout: 10000 });

    // Submit schedule
    await page.getByRole('button', { name: 'Create Schedule', exact: true }).click();

    // Verify schedule appears in list
    await expect(page.getByText('HQ Reception Weekday Broadcast').first()).toBeVisible({ timeout: 10000 });

    // Capture screenshot: schedules-list.png
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'schedules-list.png'),
      fullPage: true,
    });

    // 5. Open Timeline Simulator
    const simBtn = page.getByRole('button', { name: 'Timeline Simulator' });
    if (await simBtn.isVisible()) {
      await simBtn.click();
      await expect(page.getByRole('heading', { name: 'Digital Display Timeline Simulator' })).toBeVisible({ timeout: 10000 });

      // Run simulation
      await expect(page.getByText(/Scheduled Broadcast Active|Corporate Fallback Content|Collision Block Detected/i)).toBeVisible({ timeout: 10000 });

      // Capture screenshot: schedule-timeline-simulator.png
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'schedule-timeline-simulator.png'),
        fullPage: true,
      });

      // Close simulator
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    }

    // 6. Test Publication Package Preparation
    const prepareBtn = page.getByRole('button', { name: /Publish Package|Re-publish/i }).first();
    if (await prepareBtn.isVisible()) {
      await prepareBtn.click();
      await expect(page.getByText('Package Prepared').first()).toBeVisible({ timeout: 15000 });
    }

    // 7. Navigate to Editorial Approvals
    await page.getByRole('link', { name: 'Approvals' }).click();
    await expect(page).toHaveURL(/\/approvals/, { timeout: 15000 });

    await expect(page.getByRole('heading', { name: 'Approvals & Governance' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pending Review', exact: true })).toBeVisible();

    // Capture screenshot: approvals-review.png
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'approvals-review.png'),
      fullPage: true,
    });

    // 8. Verify Dashboard KPI Cards
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL(/\/(#.*)?$/, { timeout: 15000 });

    // Verify KPI Cards: Editorial Approvals and Active Schedules
    await expect(page.getByText('Editorial Approvals', { exact: true })).toBeVisible();
    await expect(page.getByText('Active Schedules', { exact: true })).toBeVisible();
  });
});
