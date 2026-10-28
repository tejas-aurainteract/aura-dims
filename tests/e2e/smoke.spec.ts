import { test, expect } from '@playwright/test';

test.describe('Aura DIMS - Foundation Smoke Suite', () => {
  test('renders shell branding and emulator indicator', async ({ page }) => {
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/Aura DIMS/);

    // Check company and product branding
    await expect(page.getByText('Digital Display').first()).toBeVisible();
    await expect(page.getByText('Aura DIMS').first()).toBeVisible();
    await expect(page.getByText('Aurainteract Private Limited').first()).toBeVisible();

    // Check local emulator indicator
    await expect(page.getByText(/Local Development/i).first()).toBeVisible();
    await expect(page.getByText(/Connected to Firebase Emulator Suite:/i).first()).toBeVisible();

    // Check dashboard header
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Check target digital display metrics (not fabricated)
    await expect(page.getByText('Initial Target Fleet')).toBeVisible();
    await expect(page.getByText('Asia/Kolkata').first()).toBeVisible();
  });

  test('navigates through all core routes and renders empty states', async ({ page }) => {
    await page.goto('/');

    // Displays page
    await page.getByRole('link', { name: 'Displays' }).click();
    await expect(page).toHaveURL(/\/displays/);
    await expect(page.getByRole('heading', { name: 'Digital Display Fleet Management' })).toBeVisible();
    await expect(page.getByText(/digital display/i).first()).toBeVisible();

    // Content Library page
    await page.getByRole('link', { name: 'Content Library' }).click();
    await expect(page).toHaveURL(/\/content-library/);
    await expect(page.getByRole('heading', { name: 'Media Asset Library' })).toBeVisible();

    // Content Creator page
    await page.getByRole('link', { name: 'Content Creator' }).click();
    await expect(page).toHaveURL(/\/content-creator/);
    await expect(page.getByRole('heading', { name: 'Visual Content Creator Studio' })).toBeVisible();

    // Templates page
    await page.getByRole('link', { name: 'Templates' }).click();
    await expect(page).toHaveURL(/\/templates/);
    await expect(page.getByRole('heading', { name: 'Display Layout Templates' })).toBeVisible();

    // Schedules page
    await page.getByRole('link', { name: 'Schedules' }).click();
    await expect(page).toHaveURL(/\/schedules/);
    await expect(page.getByRole('heading', { name: 'Playlist & Broadcast Scheduling' })).toBeVisible();

    // Approvals page
    await page.getByRole('link', { name: 'Approvals' }).click();
    await expect(page).toHaveURL(/\/approvals/);
    await expect(page.getByRole('heading', { name: 'Content Governance & Approval Workflow' })).toBeVisible();

    // Users & Roles page
    await page.getByRole('link', { name: 'Users & Roles' }).click();
    await expect(page).toHaveURL(/\/users-and-roles/);
    await expect(page.getByRole('heading', { name: 'User Provisioning & Role-Based Access Control' })).toBeVisible();

    // Settings page
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole('heading', { name: 'System Configuration & Multi-Site Settings' })).toBeVisible();

    // Diagnostics page
    await page.getByRole('link', { name: 'System Diagnostics' }).click();
    await expect(page).toHaveURL(/\/diagnostics/);
    await expect(page.getByRole('heading', { name: 'System & Emulator Diagnostics' })).toBeVisible();
    await expect(page.getByText('Firebase Authentication Emulator')).toBeVisible();
    await expect(page.getByText('Cloud Firestore Emulator')).toBeVisible();
    await expect(page.getByText('Cloud Storage for Firebase Emulator')).toBeVisible();
  });
});

