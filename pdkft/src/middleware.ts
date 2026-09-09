export { default } from "next-auth/middleware";

export const config = {
  // Protect all routes except the auth routes and static assets
  matcher: ["/((?!api/auth|signin|_next/static|_next/image|favicon.ico).*)"],
};
