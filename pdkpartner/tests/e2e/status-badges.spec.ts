import { test, expect } from "@playwright/test";

/**
 * Status badge regression tests for pdkpartner
 * Same status values as pdkft - ensures no regression if StatusBadge is modified.
 */

const ALL_STATUSES = [
  "pending",
  "preflight_running",
  "preflight_failed",
  "provisioning",
  "qa_running",
  "qa_failed",
  "demo_ready",
  "tearing_down",
  "done",
  "failed",
];

function makeDemoWithStatus(status: string) {
  return {
    id: `demo-${status}`,
    runId: `run-${status}`,
    blueprint: "hd",
    account: "testorg-prod",
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

test.describe("Status badges - partner", () => {
  test("all status values render without crashing", async ({ page }) => {
    const demos = ALL_STATUSES.map(makeDemoWithStatus);
    await page.route("/api/demos", (route) => route.fulfill({ json: demos }));
    await page.goto("/demos");
    for (const status of ALL_STATUSES) {
      await expect(page.getByText(status).first()).toBeVisible();
    }
  });

  test("demo_ready shows green badge", async ({ page }) => {
    await page.route("/api/demos", (route) =>
      route.fulfill({ json: [makeDemoWithStatus("demo_ready")] })
    );
    await page.goto("/demos");
    await expect(page.getByText("demo_ready")).toHaveClass(/bg-green/);
  });

  test("failed shows red badge", async ({ page }) => {
    await page.route("/api/demos", (route) =>
      route.fulfill({ json: [makeDemoWithStatus("failed")] })
    );
    await page.goto("/demos");
    await expect(page.getByText("failed")).toHaveClass(/bg-red/);
  });

  test("provisioning shows animated badge", async ({ page }) => {
    await page.route("/api/demos", (route) =>
      route.fulfill({ json: [makeDemoWithStatus("provisioning")] })
    );
    await page.goto("/demos");
    await expect(page.getByText("provisioning")).toHaveClass(/animate-pulse/);
  });
});
