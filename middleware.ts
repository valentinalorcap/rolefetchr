import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Gate app pages behind a session. The path exclusions live INSIDE the function
// (not only in `config.matcher`) because the Turbopack production build doesn't
// reliably honor the matcher on a re-export-only middleware — without this guard
// the middleware would redirect static assets (/_next/*) and /api/* too, leaving
// every page unstyled and the crons/MCP unreachable.
export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname.startsWith("/api") || // crons (CRON_SECRET), MCP (MCP_TOKEN), email-ingest, NextAuth
    pathname.startsWith("/_next") || // JS/CSS chunks, image optimizer
    pathname === "/favicon.ico" ||
    pathname === "/icon.svg" || // app icon must load on /signin (no session yet)
    pathname === "/signin";

  // A demo access-code cookie also grants entry (the page revalidates it against
  // the DB via getScope and redirects if it's stale — edge can't query the DB).
  // Keep the cookie name in sync with DEMO_COOKIE in lib/scope.ts.
  const hasDemoCookie = req.cookies.has("demo_code");

  if (isPublic || req.auth || hasDemoCookie) return NextResponse.next();

  const url = new URL("/signin", req.nextUrl.origin);
  url.searchParams.set("callbackUrl", req.nextUrl.href);
  return NextResponse.redirect(url);
});

// Kept as a perf hint (skip middleware on assets when honored); correctness no
// longer depends on it — the in-function guard above is authoritative.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
