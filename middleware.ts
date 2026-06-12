export { auth as middleware } from "@/auth";

// Gate every page. Excludes:
// - /api/*       — crons (CRON_SECRET), MCP (MCP_TOKEN), email-ingest, and the
//                  NextAuth routes are authed on their own terms.
// - /signin      — the login screen must be reachable while logged out.
// - static/_next — assets and image optimizer.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|signin).*)"],
};
