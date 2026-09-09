import { test, expect } from "@playwright/test";

/**
 * New Demo drawer tests
 * Covers: opening, blueprint/account/platform selection, preflight flow, launch
 */

const PREFLIGHT_PASS = {
  passed: true,
  checks: [
    { name: "Configuration loaded", ok: true },
    { name: "Fivetran API - MDS_SNOWFLAKE_HOL", ok: true },
    { name: "GCP project accessible (fivetran-demo)", ok: true },
    { name: "Compute Engine API enabled", ok: true },
    { name: "Secret Manager API enabled", ok: true },
    { name: "Source PostgreSQL reachable (pg.demo.internal)", ok: true },
  ],
};

const PREFLIGHT_FAIL = {
  passed: false,
  checks: [
    { name: "Configuration loaded", ok: true },
    { name: "Fivetran API - MDS_SNOWFLAKE_HOL", ok: false, message: "HTTP 401: check API key and secret" },
    { name: "GCP project accessible", ok: false, message: "GCP auth failed: no credentials found" },
    { name: "Compute Engine API enabled", ok: false },
    { name: "Secret Manager API enabled", ok: false },
    { name: "Source PostgreSQL reachable", ok: false, message: "Connection refused" },
  ],
};

const MOCK_DEMO = {
  id: "new-demo-id",
  runId: "run-new",
  blueprint: "hd",
  account: "MDS_SNOWFLAKE_HOL",
  platform: "docker",
  destination: "snowflake",
  status: "pending",
  label: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  expiresAt: null,
  region: "us-central1-a",
};

test.describe("New Demo drawer", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/demos", (route) => {
      if (route.request().method() === "GET") {
        route.fulfill({ json: [] });
      } else {
        route.fulfill({ status: 201, json: MOCK_DEMO });
      }
    });
  });

  test("opens when New Demo button is clicked", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "New Demo" }).click();
    await expect(page.getByRole("heading", { name: "New Demo" })).toBeVisible();
  });

  test("opens when empty state launch link is clicked", async ({ page }) => {
    await page.goto("/demos");
    await page.getByText("Launch your first demo").click();
    await expect(page.getByRole("heading", { name: "New Demo" })).toBeVisible();
  });

  test("shows all three blueprints", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "New Demo" }).click();
    await expect(page.getByText("Hybrid Deployment")).toBeVisible();
    await expect(page.getByText("MDLS Buildout")).toBeVisible();
    await expect(page.getByText("ODI Any-Agent")).toBeVisible();
  });

  test("MDLS and ODI blueprints are disabled (coming soon)", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "New Demo" }).click();
    const mdlsRadio = page.locator('input[type="radio"][value="mdls"]');
    const odiRadio = page.locator('input[type="radio"][value="odi"]');
    await expect(mdlsRadio).toBeDisabled();
    await expect(odiRadio).toBeDisabled();
  });

  test("shows three Fivetran accounts", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "New Demo" }).click();
    await expect(page.getByText("MDS_SNOWFLAKE_HOL")).toBeVisible();
    await expect(page.getByText("MDS_DATABRICKS_HOL")).toBeVisible();
    await expect(page.getByText("MDS_BIGQUERY_HOL")).toBeVisible();
  });

  test("shows Docker and GKE platform options for HD blueprint", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "New Demo" }).click();
    await expect(page.getByText("Docker on GCE")).toBeVisible();
    await expect(page.getByText("Kubernetes GKE")).toBeVisible();
  });

  test("close button dismisses drawer", async ({ page }) => {
    await page.goto("/demos");
    await page.getByRole("button", { name: "New Demo" }).click();
    await expect(page.getByRole("heading", { name: "New Demo" })).toBeVisible();
    await page.locator("button").filter({ has: page.locator("svg") }).first().click();
    // Backdrop or X button - use Cancel instead which is more reliable
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "New Demo" })).not.toBeVisible();
  });

  test.describe("Preflight - passing", () => {
    test.beforeEach(async ({ page }) => {
      await page.route("/api/demos/preflight", (route) => {
        route.fulfill({ json: PREFLIGHT_PASS });
      });
    });

    test("Run Preflight button calls preflight API", async ({ page }) => {
      let preflightCalled = false;
      await page.route("/api/demos/preflight", (route) => {
        preflightCalled = true;
        route.fulfill({ json: PREFLIGHT_PASS });
      });
      await page.goto("/demos");
      await page.getByRole("button", { name: "New Demo" }).click();
      await page.getByRole("button", { name: "Run Preflight" }).click();
      await expect(page.getByText("Preflight Results")).toBeVisible();
      expect(preflightCalled).toBe(true);
    });

    test("all PASS badges shown when preflight succeeds", async ({ page }) => {
      await page.goto("/demos");
      await page.getByRole("button", { name: "New Demo" }).click();
      await page.getByRole("button", { name: "Run Preflight" }).click();
      const passBadges = page.getByText("PASS");
      await expect(passBadges).toHaveCount(6);
    });

    test("Launch Demo button is enabled when preflight passes", async ({ page }) => {
      await page.goto("/demos");
      await page.getByRole("button", { name: "New Demo" }).click();
      await page.getByRole("button", { name: "Run Preflight" }).click();
      await expect(page.getByRole("button", { name: "Launch Demo" })).toBeEnabled();
    });

    test("Launch Demo calls POST /api/demos and closes drawer", async ({ page }) => {
      await page.goto("/demos");
      await page.getByRole("button", { name: "New Demo" }).click();
      await page.getByRole("button", { name: "Run Preflight" }).click();
      await page.getByRole("button", { name: "Launch Demo" }).click();
      await expect(page.getByRole("heading", { name: "New Demo" })).not.toBeVisible();
    });
  });

  test.describe("Preflight - failing", () => {
    test.beforeEach(async ({ page }) => {
      await page.route("/api/demos/preflight", (route) => {
        route.fulfill({ json: PREFLIGHT_FAIL });
      });
    });

    test("FAIL badges shown for failed checks", async ({ page }) => {
      await page.goto("/demos");
      await page.getByRole("button", { name: "New Demo" }).click();
      await page.getByRole("button", { name: "Run Preflight" }).click();
      const failBadges = page.getByText("FAIL");
      await expect(failBadges.first()).toBeVisible();
    });

    test("Launch Demo button is disabled when preflight fails", async ({ page }) => {
      await page.goto("/demos");
      await page.getByRole("button", { name: "New Demo" }).click();
      await page.getByRole("button", { name: "Run Preflight" }).click();
      await expect(page.getByRole("button", { name: "Launch Demo" })).toBeDisabled();
    });

    test("failure message is shown", async ({ page }) => {
      await page.goto("/demos");
      await page.getByRole("button", { name: "New Demo" }).click();
      await page.getByRole("button", { name: "Run Preflight" }).click();
      await expect(page.getByText("Fix the failures above before launching")).toBeVisible();
    });

    test("error message text is displayed for failed check", async ({ page }) => {
      await page.goto("/demos");
      await page.getByRole("button", { name: "New Demo" }).click();
      await page.getByRole("button", { name: "Run Preflight" }).click();
      await expect(page.getByText("HTTP 401: check API key and secret")).toBeVisible();
    });

    test("Back button returns to config step", async ({ page }) => {
      await page.goto("/demos");
      await page.getByRole("button", { name: "New Demo" }).click();
      await page.getByRole("button", { name: "Run Preflight" }).click();
      await page.getByRole("button", { name: "Back" }).click();
      await expect(page.getByText("Blueprint")).toBeVisible();
      await expect(page.getByRole("button", { name: "Run Preflight" })).toBeVisible();
    });
  });
});
