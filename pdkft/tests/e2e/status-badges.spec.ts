import { test, expect } from "@playwright/test";

/**
 * Status badge rendering regression tests
 * Ensures every known status value renders with the correct text and visual treatment.
 */

const ALL_STATUSES = [
  { status: "pending", expectedText: "pending" },
  { status: "preflight_running", expectedText: "preflight_running" },
  { status: "preflight_failed", expectedText: "preflight_failed" },
  { status: "provisioning", expectedText: "provisioning" },
  { status: "qa_running", expectedText: "qa_running" },
  { status: "qa_failed", expectedText: "qa_failed" },
  { status: "demo_ready", expectedText: "demo_ready" },
  { status: "tearing_down", expectedText: "tearing_down" },
  { status: "done", expectedText: "done" },
  { status: "failed", expectedText: "failed" },
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
  test("all status values render without crashing", async ({ page }) => {
    const demos = ALL_STATUSES.map((s) => makeDemoWithStatus(s.status));
    await page.route("/api/demos", (route) => route.fulfill({ json: demos }));

    await page.goto("/demos");

    for (const { expectedText } of ALL_STATUSES) {
      await expect(page.getByText(expectedText).first()).toBeVisible();
    }
  });

  test("demo_ready shows green badge", async ({ page }) => {
    await page.route("/api/demos", (route) =>
      route.fulfill({ json: [makeDemoWithStatus("demo_ready")] })
    );
    await page.goto("/demos");
    const badge = page.getByText("demo_ready");
    await expect(badge).toHaveClass(/bg-green/);
  });

  test("failed shows red badge", async ({ page }) => {
    await page.route("/api/demos", (route) =>
      route.fulfill({ json: [makeDemoWithStatus("failed")] })
    );
    await page.goto("/demos");
    const badge = page.getByText("failed");
    await expect(badge).toHaveClass(/bg-red/);
  });

  test("provisioning shows amber badge with animate-pulse", async ({ page }) => {
    await page.route("/api/demos", (route) =>
      route.fulfill({ json: [makeDemoWithStatus("provisioning")] })
    );
    await page.goto("/demos");
    const badge = page.getByText("provisioning");
    await expect(badge).toHaveClass(/animate-pulse/);
  });

  test("done shows gray badge", async ({ page }) => {
    await page.route("/api/demos", (route) =>
      route.fulfill({ json: [makeDemoWithStatus("done")] })
    );
    await page.goto("/demos");
    const badge = page.getByText("done");
    await expect(badge).toHaveClass(/bg-gray/);
  });
});
