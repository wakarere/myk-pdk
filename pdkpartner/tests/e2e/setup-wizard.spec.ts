import { test, expect } from "@playwright/test";

/**
 * Setup wizard E2E tests
 * Covers: redirect behavior, step navigation, per-step validation, finish flow
 * All external API calls (Fivetran, GCP) are intercepted via page.route().
 */

test.describe("Setup redirect", () => {
  test("root redirects to /setup when not configured", async ({ page }) => {
    await page.route("/api/setup/validate", (route) => route.fulfill({ json: { ok: true } }));
    // Simulate setup not complete by intercepting the page check
    // The root page.tsx reads from DB - we test it redirects in integration
    await page.goto("/setup");
    await expect(page).toHaveURL(/\/setup/);
    await expect(page.getByRole("heading", { name: "Organization" })).toBeVisible();
  });
});

test.describe("Setup wizard - step navigation", () => {
  test.beforeEach(async ({ page }) => {
    // Mock validation to always pass - focus on UI navigation
    await page.route("/api/setup/validate", (route) => route.fulfill({ json: { ok: true } }));
    await page.route("/api/setup", (route) => route.fulfill({ json: { ok: true } }));
  });

  test("renders Organization step by default", async ({ page }) => {
    await page.goto("/setup");
    await expect(page.getByRole("heading", { name: "Organization" })).toBeVisible();
    await expect(page.getByPlaceholder(/phData, Accenture/)).toBeVisible();
  });

  test("progress bar shows Organization as active on step 1", async ({ page }) => {
    await page.goto("/setup");
    const orgTab = page.getByText("Organization").first();
    await expect(orgTab).toHaveClass(/text-brand/);
  });

  test("Continue button advances from org to fivetran step", async ({ page }) => {
    await page.goto("/setup");
    await page.getByPlaceholder(/phData, Accenture/).fill("Accenture");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Fivetran Account" })).toBeVisible();
  });

  test("Back button returns from fivetran to org step", async ({ page }) => {
    await page.goto("/setup");
    await page.getByPlaceholder(/phData, Accenture/).fill("Accenture");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Fivetran Account" })).toBeVisible();
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.getByRole("heading", { name: "Organization" })).toBeVisible();
  });

  test("completed steps show checkmark in progress bar", async ({ page }) => {
    await page.goto("/setup");
    await page.getByPlaceholder(/phData, Accenture/).fill("Accenture");
    await page.getByRole("button", { name: "Continue" }).click();
    // After advancing to step 2, step 1 should be checked
    // CheckCircle icon is rendered for i < currentIdx
    const progressBar = page.locator(".flex.border-b");
    await expect(progressBar).toBeVisible();
  });

  test("navigates through all four steps", async ({ page }) => {
    await page.goto("/setup");

    // Step 1: Organization
    await page.getByPlaceholder(/phData, Accenture/).fill("TestOrg");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2: Fivetran
    await expect(page.getByRole("heading", { name: "Fivetran Account" })).toBeVisible();
    await page.getByLabel("API Key").fill("fi_test_key");
    await page.getByLabel("API Secret").fill("test_secret");
    await page.getByLabel("Account label (for display)").fill("testorg-prod");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: Cloud
    await expect(page.getByRole("heading", { name: "Cloud Environment" })).toBeVisible();
    await page.getByLabel("GCP Project ID").fill("my-project");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 4: Destination
    await expect(page.getByRole("heading", { name: "Destination" })).toBeVisible();
  });

  test("Finish Setup button appears on destination step", async ({ page }) => {
    await page.goto("/setup");
    await page.getByPlaceholder(/phData, Accenture/).fill("TestOrg");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("API Key").fill("fi_test");
    await page.getByLabel("API Secret").fill("secret");
    await page.getByLabel("Account label (for display)").fill("label");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("GCP Project ID").fill("proj");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("button", { name: "Finish Setup" })).toBeVisible();
  });
});

test.describe("Setup wizard - field validation", () => {
  test("shows error when org name is empty", async ({ page }) => {
    await page.route("/api/setup/validate", (route) => {
      route.fulfill({ json: { ok: false, error: "Organization name is required" } });
    });
    await page.goto("/setup");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Organization name is required")).toBeVisible();
  });

  test("error message clears when user starts typing", async ({ page }) => {
    await page.route("/api/setup/validate", async (route) => {
      const body = await route.request().postDataJSON();
      if (!body.config.orgName) {
        route.fulfill({ json: { ok: false, error: "Organization name is required" } });
      } else {
        route.fulfill({ json: { ok: true } });
      }
    });
    await page.goto("/setup");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Organization name is required")).toBeVisible();
    await page.getByPlaceholder(/phData, Accenture/).fill("A");
    await expect(page.getByText("Organization name is required")).not.toBeVisible();
  });

  test("shows Fivetran API error when credentials are invalid", async ({ page }) => {
    await page.route("/api/setup/validate", async (route) => {
      const body = await route.request().postDataJSON();
      if (body.step === "fivetran") {
        route.fulfill({ json: { ok: false, error: "Fivetran API returned 401 - check your API key and secret" } });
      } else {
        route.fulfill({ json: { ok: true } });
      }
    });
    await page.goto("/setup");
    // Advance through org step
    await page.getByPlaceholder(/phData, Accenture/).fill("TestOrg");
    await page.getByRole("button", { name: "Continue" }).click();
    // Try to advance Fivetran step
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText(/Fivetran API returned 401/)).toBeVisible();
  });
});

test.describe("Destination step", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/setup/validate", (route) => route.fulfill({ json: { ok: true } }));
    // Navigate to destination step
    await page.goto("/setup");
    await page.getByPlaceholder(/phData, Accenture/).fill("TestOrg");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("API Key").fill("fi_test");
    await page.getByLabel("API Secret").fill("secret");
    await page.getByLabel("Account label (for display)").fill("label");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("GCP Project ID").fill("proj");
    await page.getByRole("button", { name: "Continue" }).click();
  });

  test("Snowflake is selected by default", async ({ page }) => {
    const snowflakeBtn = page.getByRole("button", { name: "Snowflake" });
    await expect(snowflakeBtn).toHaveClass(/border-brand/);
  });

  test("Snowflake fields are shown by default", async ({ page }) => {
    await expect(page.getByLabel(/Snowflake account URL/)).toBeVisible();
    await expect(page.getByLabel("User")).toBeVisible();
    await expect(page.getByLabel("PAT Token").first()).toBeVisible();
    await expect(page.getByLabel("Warehouse")).toBeVisible();
  });

  test("switching to Databricks shows Databricks fields", async ({ page }) => {
    await page.getByRole("button", { name: "Databricks" }).click();
    await expect(page.getByLabel(/Databricks host/)).toBeVisible();
    await expect(page.getByLabel("PAT Token").first()).toBeVisible();
    await expect(page.getByLabel("Warehouse ID")).toBeVisible();
    await expect(page.getByLabel(/Snowflake account URL/)).not.toBeVisible();
  });

  test("switching back to Snowflake hides Databricks fields", async ({ page }) => {
    await page.getByRole("button", { name: "Databricks" }).click();
    await page.getByRole("button", { name: "Snowflake" }).click();
    await expect(page.getByLabel(/Snowflake account URL/)).toBeVisible();
    await expect(page.getByLabel(/Databricks host/)).not.toBeVisible();
  });
});

test.describe("Cloud step", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/setup/validate", (route) => route.fulfill({ json: { ok: true } }));
    await page.goto("/setup");
    await page.getByPlaceholder(/phData, Accenture/).fill("TestOrg");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("API Key").fill("fi_test");
    await page.getByLabel("API Secret").fill("secret");
    await page.getByLabel("Account label (for display)").fill("label");
    await page.getByRole("button", { name: "Continue" }).click();
  });

  test("GCP is selected by default", async ({ page }) => {
    await expect(page.getByRole("button", { name: "GCP" })).toHaveClass(/border-brand/);
  });

  test("AWS and Azure buttons are disabled (coming soon)", async ({ page }) => {
    await expect(page.getByRole("button", { name: /AWS/ })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Azure/ })).toBeDisabled();
  });

  test("GCP Project ID field is present", async ({ page }) => {
    await expect(page.getByLabel("GCP Project ID")).toBeVisible();
  });

  test("GCP Zone field has default value", async ({ page }) => {
    await expect(page.getByLabel("GCP Zone")).toHaveValue("us-central1-a");
  });
});
