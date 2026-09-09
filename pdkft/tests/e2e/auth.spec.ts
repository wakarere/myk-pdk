import { test, expect, BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";

const TEST_SECRET = process.env.NEXTAUTH_SECRET ?? "8B4qaxRCuqF7ib7qtl+N/TA96p3lLfBp11RLkwTlmCU=";

async function setAuthCookie(context: BrowserContext) {
  const token = await encode({
    token: {
      name: "Kelly Kohlleffel",
      email: "kelly@fivetran.com",
      sub: "test-user-id",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    secret: TEST_SECRET,
  });
  await context.addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
    },
  ]);
}

test.describe("Auth - unauthenticated redirects", () => {
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
    await page.goto("/signin");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible();
  });

  test("shows access denied message for non-@fivetran.com accounts", async ({ page }) => {
    await page.goto("/signin?error=AccessDenied");
    await expect(page.getByText(/@fivetran\.com/)).toBeVisible();
  });

  test("redirects to /demos when already authenticated", async ({ page, context }) => {
    await setAuthCookie(context);
    await page.route("**/api/demos", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );
    await page.goto("/signin");
    await expect(page).toHaveURL(/\/demos/);
  });
});

test.describe("Auth - authenticated session", () => {
  test.beforeEach(async ({ context, page }) => {
    await setAuthCookie(context);
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
    await page.getByTitle("Sign out").click();
    await expect(page).toHaveURL(/\/signin/);
  });
});
