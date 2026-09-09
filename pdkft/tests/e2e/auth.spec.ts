import { test, expect } from "@playwright/test";

// Mock NextAuth session responses
const AUTHED_SESSION = {
  user: { name: "Kelly Kohlleffel", email: "kelly@fivetran.com", image: null },
  expires: "2099-01-01T00:00:00.000Z",
};

test.describe("Auth - unauthenticated redirects", () => {
  test.beforeEach(async ({ page }) => {
    // No session - middleware should redirect to /signin
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    );
  });

  test("root redirects to /signin when unauthenticated", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/signin/);
  });

  test("/demos redirects to /signin when unauthenticated", async ({ page }) => {
    await page.goto("/demos");
    await expect(page).toHaveURL(/\/signin/);
  });
});

test.describe("Auth - signin page", () => {
  test("renders sign-in page with Google button", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    );
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible();
  });

  test("shows access denied message for non-@fivetran.com accounts", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    );
    await page.goto("/signin?error=AccessDenied");
    await expect(page.getByText(/fivetran\.com/i)).toBeVisible();
  });

  test("redirects to /demos when already authenticated", async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(AUTHED_SESSION),
      })
    );
    await page.goto("/signin");
    await expect(page).toHaveURL(/\/demos/);
  });
});

test.describe("Auth - authenticated session", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(AUTHED_SESSION),
      })
    );
    await page.route("**/api/demos", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );
  });

  test("sidebar shows signed-in user name and email", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByText("Kelly Kohlleffel")).toBeVisible();
    await expect(page.getByText("kelly@fivetran.com")).toBeVisible();
  });

  test("sidebar has sign-out button", async ({ page }) => {
    await page.goto("/demos");
    await expect(page.getByTitle("Sign out")).toBeVisible();
  });

  test("sign-out navigates to /signin", async ({ page }) => {
    await page.goto("/demos");

    // Mock the signout endpoint
    await page.route("**/api/auth/signout", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"url":"/signin"}' })
    );
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
    );

    await page.getByTitle("Sign out").click();
    await expect(page).toHaveURL(/\/signin/);
  });
});
