import { test, expect } from "@playwright/test";

/**
 * Navigation and routing tests
 * Covers: root redirect, sidebar links, active state, tab persistence
 */

test.describe("Navigation", () => {
  test("root redirects to /demos", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/demos/);
  });

  test("sidebar renders with PDK ft branding", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("PDK")).toBeVisible();
    await expect(page.getByText("ft")).toBeVisible();
  });

  test("sidebar shows Lab Credentials footer", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("Lab Credentials")).toBeVisible();
    await expect(page.getByText("Kelly Kohlleffel")).toBeVisible();
  });

  test("Demos nav item is active on /demos", async ({ page }) => {
    await page.goto("/demos");
    const demosLink = page.getByRole("link", { name: "Demos" });
    await expect(demosLink).toHaveClass(/bg-sidebar-active/);
  });

  test("sidebar nav links are present", async ({ page }) => {
    await page.goto("/demos");
    for (const label of ["Demos", "Analytics", "Resources", "Requests", "Admin", "Settings"]) {
      await expect(page.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("analytics link navigates to analytics page", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("link", { name: "Analytics" }).click();
    await expect(page).toHaveURL(/\/analytics/);
  });
});
