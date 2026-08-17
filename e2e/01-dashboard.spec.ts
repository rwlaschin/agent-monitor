import { test, expect } from '@playwright/test';

test.describe('Agent Monitor Dashboard E2E', () => {
  test('renders dashboard overview with navigation, metrics, and column switcher', async ({ page }) => {
    await page.goto('/');

    // Verify Header
    await expect(page.locator('header')).toContainText('AGENT MONITOR');

    // Verify Metrics summary cards
    await expect(page.locator('main')).toContainText('Total Burn');
    await expect(page.locator('main')).toContainText('Monitored Agents');
    await expect(page.locator('main')).toContainText('Active Processes');

    // Test Column Switcher buttons
    const twoColBtn = page.getByRole('button', { name: '2 Columns' });
    const fourColBtn = page.getByRole('button', { name: '4 Columns' });
    await expect(twoColBtn).toBeVisible();
    await fourColBtn.click();

    // Verify Settings page navigation
    const settingsLink = page.getByTitle('Settings & Config');
    await settingsLink.click();
    await expect(page).toHaveURL('/settings');
    await expect(page.locator('h1')).toContainText('Agent Configuration');

    // Test Breadcrumb back to Dashboard
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await expect(page).toHaveURL('/');
  });
});
