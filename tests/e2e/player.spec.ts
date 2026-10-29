/**
 * Aura DIMS - Digital Displays Fleet & Player Playback E2E Spec
 * Company: Aurainteract Private Limited
 * Product: Aura Digital Information Management System (Aura DIMS)
 *
 * Terminology rule: Always use "digital display" in all user-facing copy.
 */

import { test, expect } from '@playwright/test';
import * as path from 'node:path';

const ARTIFACTS_DIR = 'C:/Users/meshw/.gemini/antigravity/brain/b6363ab7-edf1-4cc2-ad2a-d8361fec7b28';

test.describe('Aura DIMS - Digital Displays Fleet & Player Playback', () => {
  test('navigates to digital displays fleet view and generates pairing code', async ({ page }) => {
    test.setTimeout(60000);

    // 1. Sign in as Administrator
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@aurainteract.com');
    await page.locator('input[type="password"]').fill('AuraAdmin#2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/(#.*)?$/, { timeout: 15000 });

    // 2. Navigate to Digital Displays in sidebar
    await page.getByRole('link', { name: 'Digital Displays' }).click();
    await expect(page).toHaveURL(/\/displays/, { timeout: 10000 });

    // 3. Verify Header and Fleet KPIs
    await expect(page.getByText('Digital Displays Fleet Management')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Registered Fleet', { exact: true })).toBeVisible();
    await expect(page.getByText('Online Displays', { exact: true })).toBeVisible();
    await expect(page.getByText('Active Presentation', { exact: true }).first()).toBeVisible();

    // 4. Verify seeded digital displays are rendered
    await expect(page.getByText('Reception Lobby Display').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Plant 1 Entrance Totem').first()).toBeVisible();

    // Take screenshot of Digital Displays fleet view
    const fleetScreenshotPath = path.join(ARTIFACTS_DIR, 'displays-fleet-management.png');
    await page.screenshot({ path: fleetScreenshotPath, fullPage: true });

    // 5. Test Orientation Filtering
    const orientationSelect = page.locator('select').first();
    await orientationSelect.selectOption('portrait');
    await expect(page.getByText('Plant 1 Entrance Totem').first()).toBeVisible();
    await expect(page.getByText('Reception Lobby Display')).not.toBeVisible();

    // Reset filter
    await orientationSelect.selectOption('all');
    await expect(page.getByText('Reception Lobby Display').first()).toBeVisible();

    // 6. Generate Pairing Code for a digital display
    const pairingBtn = page.locator('button:has-text("Pairing Code")').first();
    await pairingBtn.click();

    // Verify Enrollment Modal
    await expect(page.getByText('Digital Display Enrollment Code')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Copy Code")')).toBeVisible({ timeout: 15000 });

    // Take screenshot of pairing code modal
    const pairingScreenshotPath = path.join(ARTIFACTS_DIR, 'pairing-code-modal.png');
    await page.screenshot({ path: pairingScreenshotPath });

    // Close modal
    await page.click('button:has-text("Done")');
    await expect(page.getByText('Digital Display Enrollment Code')).not.toBeVisible();

    // 7. Open Full Telemetry Diagnostics
    const telemetryBtn = page.locator('button:has-text("Full Telemetry")').first();
    await telemetryBtn.click();

    await expect(page.getByText('Digital Display Diagnostics & Delivery')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Hardware & Runtime')).toBeVisible();
    await expect(page.getByText('Delivery State Machine')).toBeVisible();

    // Take screenshot of Diagnostics drawer
    const diagScreenshotPath = path.join(ARTIFACTS_DIR, 'display-diagnostics-drawer.png');
    await page.screenshot({ path: diagScreenshotPath });

    await page.click('button:has-text("Close Diagnostics")');
  });

  test('exercises local digital display renderer loopback screen', async ({ page }) => {
    test.setTimeout(30000);

    // Navigate directly to the local player renderer on loopback 8090
    await page.goto('http://127.0.0.1:8090/');
    await page.waitForLoadState('networkidle');

    // Verify Aura DIMS branding and pairing interface on the display player
    await expect(page.getByText('Digital Display Enrollment')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#pair-code-input')).toBeVisible();
    await expect(page.locator('#pair-btn')).toBeVisible();

    // Capture Player Renderer Screenshot
    const playerScreenshotPath = path.join(ARTIFACTS_DIR, 'digital-display-player-renderer.png');
    await page.screenshot({ path: playerScreenshotPath, fullPage: true });
  });
});
