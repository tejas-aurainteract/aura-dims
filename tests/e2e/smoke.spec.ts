import { test, expect } from '@playwright/test';
import * as path from 'node:path';

const ARTIFACT_DIR = 'C:/Users/meshw/.gemini/antigravity/brain/b6363ab7-edf1-4cc2-ad2a-d8361fec7b28';

test.describe('Aura DIMS - Milestone 2 End-to-End Suite', () => {
  test('redirects unauthenticated user to login and renders branded interface without public signup', async ({ page }) => {
    // Attempt visiting protected dashboard route directly
    await page.goto('/');

    // Must redirect to /login
    await expect(page).toHaveURL(/\/login/);

    // Verify company branding and product identity
    await expect(page.getByRole('heading', { name: 'Aura DIMS' })).toBeVisible();
    await expect(page.getByText('Aurainteract Private Limited')).toBeVisible();
    await expect(page.getByText(/Aura Digital Information Management System/i)).toBeVisible();

    // Verify public self-registration is strictly disabled
    await expect(page.getByText(/Public registration is disabled/i)).toBeVisible();
    await expect(page.locator('a[href*="register"], a[href*="signup"]')).toHaveCount(0);

    // Verify local emulator helper instructions
    await expect(page.getByText('Local Emulator Environment')).toBeVisible();
    await expect(page.getByText('admin@aurainteract.com')).toBeVisible();

    // Verify Forgot Password navigation link
    await expect(page.getByRole('link', { name: /Forgot password/i })).toBeVisible();

    // Capture screenshot of Login screen
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'login-screen.png'), fullPage: true });
  });

  test('validates invalid credentials error message', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('nonexistent@aurainteract.com');
    await page.locator('input[type="password"]').fill('WrongPassword123!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText(/Invalid email or password/i)).toBeVisible({ timeout: 10000 });
  });

  test('generic password reset request obscures user enumeration', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Reset Password' })).toBeVisible();

    await page.locator('input[type="email"]').fill('any-user@aurainteract.com');
    await page.getByRole('button', { name: 'Send Reset Instructions' }).click();

    // Generic confirmation message must appear
    await expect(page.getByText(/instructions to reset your password have been sent/i)).toBeVisible();
  });

  test('authenticates as Administrator and renders simplified application shell and dashboard', async ({ page }) => {
    await page.goto('/login');

    // Fill in bootstrapped Administrator credentials
    await page.locator('input[type="email"]').fill('admin@aurainteract.com');
    await page.locator('input[type="password"]').fill('AuraAdmin#2026');
    await page.getByRole('button', { name: 'Sign in' }).click();

    // Successfully navigates to Dashboard
    await expect(page).toHaveURL(/\/(#.*)?$/);

    // Verify Header: authenticated name, role badge, dev indicator
    await expect(page.getByText(/Welcome back/i)).toBeVisible();
    await expect(page.getByText(/Admin/i).first()).toBeVisible();

    // Verify nonfunctional global search and notification bell are REMOVED
    await expect(page.locator('input[placeholder*="Search content"]')).toHaveCount(0);
    await expect(page.locator('button[title="Notifications"]')).toHaveCount(0);

    // Verify removal of fake metrics and milestone commentary
    await expect(page.getByText('Initial Target Fleet')).toHaveCount(0);
    await expect(page.getByText('Milestone: Foundation & Emulators')).toHaveCount(0);

    // Verify compact setup state notice
    await expect(page.getByText(/Digital Display Fleet & Content Management Configuration/i)).toBeVisible();

    // Verify terminology: "digital display" used exclusively
    await expect(page.getByText(/digital display/i).first()).toBeVisible();

    // Verify Sidebar primary navigation
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Displays' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Content' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Schedules' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Approvals' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Users' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();

    // Capture screenshot of Simplified Dashboard
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'dashboard-simplified.png'), fullPage: true });
  });

  test('admin accesses Users & Access Control management', async ({ page }) => {
    // Sign in first
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@aurainteract.com');
    await page.locator('input[type="password"]').fill('AuraAdmin#2026');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/(#.*)?$/);

    // Navigate to Users
    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page).toHaveURL(/\/users/);

    // Verify User management UI
    await expect(page.getByRole('heading', { name: 'Users & Access Control' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Provision User' })).toBeVisible();
    await expect(page.getByText('Active Administrators')).toBeVisible();

    // Admin user should be listed in table
    await expect(page.getByText('admin@aurainteract.com')).toBeVisible();

    // Capture screenshot of Users management
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'users-management.png'), fullPage: true });
  });

  test('verifies Content hub tabs and legacy route redirects', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@aurainteract.com');
    await page.locator('input[type="password"]').fill('AuraAdmin#2026');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/(#.*)?$/);

    // Test Content tabs
    await page.getByRole('link', { name: 'Content' }).click();
    await expect(page).toHaveURL(/\/content/);
    await expect(page.getByRole('button', { name: 'Designs', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Media Library', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Templates', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create content' })).toBeVisible();

    // Test legacy redirects
    await page.goto('/content-library');
    await expect(page).toHaveURL(/\/content\?tab=media/);

    await page.goto('/content-creator');
    await expect(page).toHaveURL(/\/content\?tab=designs/);

    await page.goto('/templates');
    await expect(page).toHaveURL(/\/content\?tab=templates/);

    await page.goto('/users-and-roles');
    await expect(page).toHaveURL(/\/users/);
  });

  test('verifies Settings page shows timezone Asia/Kolkata and supported languages', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('admin@aurainteract.com');
    await page.locator('input[type="password"]').fill('AuraAdmin#2026');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/(#.*)?$/);

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings/);

    // Verify timezone Asia/Kolkata
    await expect(page.getByText('Asia/Kolkata')).toBeVisible();
    await expect(page.getByText('Indian Standard Time (IST, UTC+05:30)')).toBeVisible();

    // Verify supported languages
    await expect(page.getByText('English (en)')).toBeVisible();
    await expect(page.getByText('Gujarati (gu)')).toBeVisible();
    await expect(page.getByText('Hindi (hi)')).toBeVisible();
  });
});
