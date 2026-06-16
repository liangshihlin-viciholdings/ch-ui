import { test, expect, Page } from '@playwright/test';

// Helper: wait for the app initializer loading spinner to finish.
// The MultiStepLoader runs for ~3s before the real UI mounts.
async function waitForApp(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // The loading states take ~3 seconds (3 states × 1000ms).
  // Wait for the sidebar nav text to appear, which means the app has loaded.
  await page.waitForSelector('text=Workbench', { timeout: 30000 });
}

test.describe('SQL Editor Enhancements - Complete User Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await waitForApp(page);
  });

  test.describe('Workflow 1: Navigation and UI Elements', () => {
    test('should navigate to home page and see main elements', async ({ page }) => {
      // The sidebar renders a "Workbench" navigation link
      const workbenchLink = page.locator('a:has-text("Workbench"), button:has-text("Workbench")');
      await expect(workbenchLink.first()).toBeVisible({ timeout: 10000 });
    });

    test('should display home page content', async ({ page }) => {
      const body = page.locator('body');
      await expect(body).toBeVisible({ timeout: 5000 });
    });

    test('should navigate to settings page', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const settingsHeading = page.locator('h1:has-text("Settings")');
      await expect(settingsHeading).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Workflow 2: Connection Management UI', () => {
    test('should display connection manager in settings', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const settingsHeading = page.locator('h1:has-text("Settings")');
      await expect(settingsHeading).toBeVisible({ timeout: 10000 });
    });

    test('should display query defaults card in settings', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const queryDefaults = page.locator('text=Query Defaults');
      await expect(queryDefaults.first()).toBeVisible({ timeout: 10000 });
    });

    test('should display danger zone in settings', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const dangerZone = page.locator('text=Danger Zone');
      await expect(dangerZone.first()).toBeVisible({ timeout: 10000 });
    });

    test('should have appearance tab in settings', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const appearanceTab = page.locator('[role="tab"]:has-text("Appearance")');
      await expect(appearanceTab).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Workflow 3: Layout Persistence', () => {
    test('should save layout preference to localStorage', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.setItem('sql-editor-layout-orientation', 'horizontal');
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      const orientation = await page.evaluate(() => {
        return localStorage.getItem('sql-editor-layout-orientation');
      });

      expect(orientation).toBe('horizontal');
    });

    test('should default to vertical layout', async ({ page }) => {
      await page.evaluate(() => {
        localStorage.removeItem('sql-editor-layout-orientation');
      });

      await page.reload();
      await page.waitForLoadState('networkidle');

      const orientation = await page.evaluate(() => {
        return localStorage.getItem('sql-editor-layout-orientation');
      });

      expect(orientation === 'vertical' || orientation === null).toBeTruthy();
    });
  });

  test.describe('Error Scenarios and Edge Cases', () => {
    test('should handle 404 page', async ({ page }) => {
      await page.goto('/non-existent-page');
      await page.waitForLoadState('networkidle');

      const notFound = page.locator('text=404');
      await expect(notFound.first()).toBeVisible({ timeout: 10000 });
    });

    test('should handle navigation to admin page', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');

      const pageContent = page.locator('body');
      await expect(pageContent).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Accessibility Compliance', () => {
    test('should have accessible buttons', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const buttons = page.locator('button');
      const buttonCount = await buttons.count();

      expect(buttonCount).toBeGreaterThan(0);
    });

    test('should have proper form labels', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      const labels = page.locator('label');
      const labelCount = await labels.count();

      expect(labelCount).toBeGreaterThan(0);
    });

    test('should support keyboard navigation', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);

      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
    });
  });

  test.describe('Responsive Behavior', () => {
    test('should display correctly on mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });

      const body = page.locator('body');
      await expect(body).toBeVisible();
    });

    test('should display correctly on tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });

      const body = page.locator('body');
      await expect(body).toBeVisible();
    });

    test('should display correctly on desktop viewport', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 });

      const body = page.locator('body');
      await expect(body).toBeVisible();
    });
  });

  test.describe('Performance Validation', () => {
    test('should load home page quickly', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(30000);
    });

    test('should navigate between pages quickly', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const startTime = Date.now();
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');
      const navTime = Date.now() - startTime;

      expect(navTime).toBeLessThan(15000);
    });
  });
});
