import { test, expect } from "@playwright/test";

/**
 * Demos list view tests
 * Covers: empty state, tabs, table rendering, auto-refresh, log panel
 * All API calls are intercepted - no real DB or external services needed.
 */

const MOCK_DEMOS = [
  {
    id: "demo-1",
    runId: "run-abc123",
    blueprint: "hd",
    account: "MDS_SNOWFLAKE_HOL",
    platform: "docker",
    destination: "snowflake",
    status: "demo_ready",
    label: "phData Pilot",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: null,
    region: "us-central1-a",
  },
  {
    id: "demo-2",
    runId: "run-def456",
    blueprint: "hd",
    account: "MDS_DATABRICKS_HOL",
    platform: "docker",
    destination: "databricks",
    status: "provisioning",
    label: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: null,
    region: "us-central1-a",
  },
  {
    id: "demo-3",
    runId: "run-ghi789",
    blueprint: "hd",
    account: "MDS_SNOWFLAKE_HOL",
    platform: "gke",
    destination: "snowflake",
    status: "done",
    label: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: null,
    region: "us-central1-a",
  },
];

test.describe("Demos list - with data", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/demos", (route) => {
      route.fulfill({ json: MOCK_DEMOS });
    });
  });

  test("renders demo table with correct blueprint labels", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("Hybrid Deployment").first()).toBeVisible();
  });

  test("shows destination and platform in blueprint column", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("Snowflake - docker").first()).toBeVisible();
  });

  test("shows status badges for all demos", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("demo_ready")).toBeVisible();
    await expect(page.getByText("provisioning")).toBeVisible();
    await expect(page.getByText("done")).toBeVisible();
  });

  test("shows partner label when set", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("phData Pilot")).toBeVisible();
  });

  test("All tab shows all demos", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "All" }).click();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(3);
  });

  test("Active tab filters to active demos only", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: /Active/ }).click();
    // demo_ready and provisioning are "active"
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(2);
  });

  test("Active tab shows count badge when demos are active", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("2")).toBeVisible(); // badge showing 2 active
  });

  test("Done tab shows completed demos only", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "Done" }).click();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(1);
  });

  test("Teardown button visible for active demos", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByRole("button", { name: "Teardown" }).first()).toBeVisible();
  });

  test("teardown prompts confirmation before calling API", async ({ page }) => {
    let teardownCalled = false;
    await page.route("/api/demos/demo-1/teardown", (route) => {
      teardownCalled = true;
      route.fulfill({ json: { ok: true } });
    });

    await page.goto("/demos");

    // Dismiss the confirm dialog
    page.on("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "Teardown" }).first().click();
    expect(teardownCalled).toBe(false);
  });

  test("teardown calls API when confirmed", async ({ page }) => {
    let teardownCalled = false;
    await page.route("/api/demos/demo-1/teardown", (route) => {
      teardownCalled = true;
      route.fulfill({ json: { ok: true } });
    });

    await page.goto("/demos");

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Teardown" }).first().click();
    await page.waitForTimeout(200);
    expect(teardownCalled).toBe(true);
  });
});

test.describe("Demos list - empty state", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/demos", (route) => {
      route.fulfill({ json: [] });
    });
  });

  test("shows empty state message", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("No demos yet.")).toBeVisible();
  });

  test("empty state has launch link", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("Launch your first demo")).toBeVisible();
  });
});

test.describe("Log panel", () => {
  const MOCK_LOGS = [
    { stage: "Preflight", message: "Running preflight checks...", level: "info", createdAt: new Date().toISOString() },
    { stage: "HD Agent", message: "Creating Fivetran group: pdk-group-abc123", level: "info", createdAt: new Date().toISOString() },
    { stage: "Error", message: "Connection refused", level: "error", createdAt: new Date().toISOString() },
  ];

  test.beforeEach(async ({ page }) => {
    await page.route("/api/demos", (route) => route.fulfill({ json: MOCK_DEMOS }));
    await page.route("/api/demos/demo-1", (route) => route.fulfill({ json: MOCK_DEMOS[0] }));
    await page.route("/api/demos/demo-1/logs", (route) => route.fulfill({ json: MOCK_LOGS }));
  });

  test("clicking a row opens log panel", async ({ page }) => {
    await page.goto("/demos");
    await page.locator("tbody tr").first().click();
    await expect(page.getByText("Run log")).toBeVisible();
  });

  test("log panel shows stage and message", async ({ page }) => {
    await page.goto("/demos");
    await page.locator("tbody tr").first().click();
    await expect(page.getByText("Running preflight checks...")).toBeVisible();
  });

  test("error logs render in red", async ({ page }) => {
    await page.goto("/demos");
    await page.locator("tbody tr").first().click();
    const errorStage = page.getByText("Error");
    await expect(errorStage).toHaveClass(/text-red-600/);
  });

  test("log panel closes when X is clicked", async ({ page }) => {
    await page.goto("/demos");
    await page.locator("tbody tr").first().click();
    await expect(page.getByText("Run log")).toBeVisible();
    await page.getByRole("button", { name: "×" }).click();
    await expect(page.getByText("Run log")).not.toBeVisible();
  });
});
