import { test, expect } from "@playwright/test";
import { setAuthCookie } from "./helpers";

/**
 * Status badge rendering regression tests
 * Ensures every known status value renders with the correct text and visual treatment.
 */

// Maps raw status → display label from StatusBadge component
const ALL_STATUSES = [
  { status: "pending",           label: "Pending" },
  { status: "preflight_running", label: "Preflight" },
  { status: "preflight_failed",  label: "Preflight Failed" },
  { status: "provisioning",      label: "Provisioning" },
  { status: "qa_running",        label: "QA Running" },
  { status: "qa_failed",         label: "QA Failed" },
  { status: "demo_ready",        label: "Demo Ready" },
  { status: "tearing_down",      label: "Tearing Down" },
  { status: "done",              label: "Done" },
  { status: "failed",            label: "Failed" },
];

function makeDemoWithStatus(status: string) {
  return {
    id: `demo-${status}`,
    runId: `run-${status}`,
    blueprint: "hd",
    account: "MDS_SNOWFLAKE_HOL",
    platform: "docker",
    destination: "snowflake",
    status,
    label: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: null,
    region: "us-central1-a",
  };
}

test.describe("Status badges", () => {
  test.beforeEach(async ({ context }) => {
    await setAuthCookie(context);
  });

  test("all status values render without crashing", async ({ page }) => {
    const demos = ALL_STATUSES.map((s) => makeDemoWithStatus(s.status));
    await page.route("**/api/demos", (route) => route.fulfill({ json: demos }));
    await page.goto("/demos");
    const tbody = page.locator("tbody");
    for (const { label } of ALL_STATUSES) {
      await expect(tbody.getByText(label).first()).toBeVisible();
    }
  });

  test("demo_ready shows green badge", async ({ page }) => {
    await page.route("**/api/demos", (route) =>
      route.fulfill({ json: [makeDemoWithStatus("demo_ready")] })
    );
    await page.goto("/demos");
    const badge = page.locator("tbody").getByText("Demo Ready");
    await expect(badge).toHaveClass(/bg-green/);
  });

  test("failed shows red badge", async ({ page }) => {
    await page.route("**/api/demos", (route) =>
      route.fulfill({ json: [makeDemoWithStatus("failed")] })
    );
    await page.goto("/demos");
    const badge = page.locator("tbody").getByText("Failed");
    await expect(badge).toHaveClass(/bg-red/);
  });

  test("provisioning shows amber badge with animate-pulse", async ({ page }) => {
    await page.route("**/api/demos", (route) =>
      route.fulfill({ json: [makeDemoWithStatus("provisioning")] })
    );
    await page.goto("/demos");
    const badge = page.locator("tbody").getByText("Provisioning");
    await expect(badge).toHaveClass(/animate-pulse/);
  });

  test("done shows gray badge", async ({ page }) => {
    await page.route("**/api/demos", (route) =>
      route.fulfill({ json: [makeDemoWithStatus("done")] })
    );
    await page.goto("/demos");
    const badge = page.locator("tbody").getByText("Done");
    await expect(badge).toHaveClass(/bg-gray/);
  });
});
