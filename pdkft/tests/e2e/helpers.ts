import { BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";

const TEST_SECRET =
  process.env.NEXTAUTH_SECRET ?? "8B4qaxRCuqF7ib7qtl+N/TA96p3lLfBp11RLkwTlmCU=";

export const TEST_USER = {
  name: "Kelly Kohlleffel",
  email: "kelly@fivetran.com",
};

export async function setAuthCookie(context: BrowserContext) {
  const token = await encode({
    token: {
      ...TEST_USER,
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
