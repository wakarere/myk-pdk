import { test, expect } from "@playwright/test";

/**
 * Partner demos view E2E tests
 * Covers: list rendering, tabs, log panel, new demo drawer (partner-simplified)
 */

const MOCK_DEMOS = [
  {
    id: "demo-1",
    runId: "run-aaa",
    blueprint: "hd",
    account: "testorg-prod",
    platform: "docker",
    destination: "snowflake",
    status: "demo_ready",
    label: "Accenture POC",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: null,
    region: "us-central1-a",
  },
  {
    id: "demo-2",
    runId: "run-bbb",
    blueprint: "hd",
    account: "testorg-prod",
    platform: "docker",
    destination: "snowflake",
    status: "provisioning",
    label: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    expiresAt: null,
    region: "us-central1-a",
  },
];

const MOCK_ORG = {
  orgName: "TestOrg",
  destination: "snowflake",
  fivetranAccount: "testorg-prod",
};

test.describe("Partner demos view", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/demos", (route) => route.fulfill({ json: MOCK_DEMOS }));
  });

  test("shows org name in header", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("Demos")).toBeVisible();
  });

  test("renders demo rows", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("Hybrid Deployment").first()).toBeVisible();
  });

  test("shows Accenture POC label", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("Accenture POC")).toBeVisible();
  });

  test("shows destination column", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("Snowflake").first()).toBeVisible();
  });

  test("Active tab filters correctly", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: /Active/ }).click();
    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(2); // demo_ready + provisioning
  });

  test("Done tab is empty when no done demos", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("No demos yet.")).toBeVisible();
  });

  test("PDK partner branding in sidebar", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("PDK")).toBeVisible();
    await expect(page.getByText("partner")).toBeVisible();
  });

  test("sidebar shows fewer nav items than pdkft (no Admin/Requests)", async ({ page }) => {
    await page.goto("/demos");
    // Partner sidebar has Demos, Analytics, Resources, Settings
    await expect(page.getByRole("link", { name: "Demos" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Analytics" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    // Admin and Requests should NOT be present
    await expect(page.getByRole("link", { name: "Admin" })).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Requests" })).not.toBeVisible();
  });
});

test.describe("Partner new demo drawer", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/demos", (route) => {
      if (route.request().method() === "GET") route.fulfill({ json: [] });
      else route.fulfill({ status: 201, json: { id: "new-demo", status: "pending", runId: "run-new" } });
    });
    await page.route("/api/demos/preflight", (route) =>
      route.fulfill({
        json: {
          passed: true,
          checks: [
            { name: "Configuration loaded", ok: true },
            { name: "Fivetran API - testorg-prod", ok: true },
            { name: "GCP project accessible (my-project)", ok: true },
            { name: "Compute Engine API enabled", ok: true },
            { name: "Secret Manager API enabled", ok: true },
            { name: "Snowflake credentials configured", ok: true },
          ],
        },
      })
    );
  });

  test("opens when New Demo is clicked", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "New Demo" }).click();
    await expect(page.getByRole("heading", { name: "New Demo" })).toBeVisible();
  });

  test("shows destination info banner (no account selection)", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "New Demo" }).click();
    // Partner drawer shows destination info but no account radio buttons
    await expect(page.getByText("Destination:")).toBeVisible();
  });

  test("MDLS and ODI show as coming soon", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "New Demo" }).click();
    await expect(page.getByText("Coming soon").first()).toBeVisible();
  });

  test("partner drawer has no Fivetran account selector", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "New Demo" }).click();
    await expect(page.getByText("MDS_SNOWFLAKE_HOL")).not.toBeVisible();
    await expect(page.getByText("MDS_DATABRICKS_HOL")).not.toBeVisible();
  });

  test("event label field is present", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "New Demo" }).click();
    await expect(page.getByPlaceholder(/Accenture POC, Q3 Workshop/)).toBeVisible();
  });

  test("preflight runs and shows results", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "New Demo" }).click();
    await page.getByRole("button", { name: "Run Preflight" }).click();
    await expect(page.getByText("Preflight Results")).toBeVisible();
    await expect(page.getByText("PASS").first()).toBeVisible();
  });

  test("Launch Demo enabled after passing preflight", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "New Demo" }).click();
    await page.getByRole("button", { name: "Run Preflight" }).click();
    await expect(page.getByRole("button", { name: "Launch Demo" })).toBeEnabled();
  });
});

test.describe("Partner teardown", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/demos", (route) => route.fulfill({ json: MOCK_DEMOS }));
  });

  test("teardown button visible for active demos", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByRole("button", { name: "Teardown" }).first()).toBeVisible();
  });

  test("teardown requires confirmation", async ({ page }) => {
    let called = false;
    await page.route("/api/demos/demo-1/teardown", (route) => {
      called = true;
      route.fulfill({ json: { ok: true } });
    });
    await page.goto("/demos");
    page.on("dialog", (d) => d.dismiss());
    await page.getByRole("button", { name: "Teardown" }).first().click();
    expect(called).toBe(false);
  });
});

test.describe("Partner log panel", () => {
  const LOGS = [
    { stage: "Preflight", message: "All checks passed", level: "info", createdAt: new Date().toISOString() },
    { stage: "HD Agent", message: "Agent is online", level: "info", createdAt: new Date().toISOString() },
  ];

  test.beforeEach(async ({ page }) => {
    await page.route("/api/demos", (route) => route.fulfill({ json: MOCK_DEMOS }));
    await page.route("/api/demos/demo-1", (route) => route.fulfill({ json: MOCK_DEMOS[0] }));
    await page.route("/api/demos/demo-1/logs", (route) => route.fulfill({ json: LOGS }));
  });

  test("clicking row opens log panel", async ({ page }) => {
    await page.goto("/demos");
    await page.locator("tbody tr").first().click();
    await expect(page.getByText("Run log")).toBeVisible();
  });

  test("log messages are shown", async ({ page }) => {
    await page.goto("/demos");
    await page.locator("tbody tr").first().click();
    await expect(page.getByText("All checks passed")).toBeVisible();
    await expect(page.getByText("Agent is online")).toBeVisible();
  });

  test("log panel close button works", async ({ page }) => {
    await page.goto("/demos");
    await page.locator("tbody tr").first().click();
    await page.getByRole("button", { name: "×" }).click();
    await expect(page.getByText("Run log")).not.toBeVisible();
  });
});
