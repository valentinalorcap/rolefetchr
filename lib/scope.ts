import { cookies } from "next/headers";
import type { DemoSpace } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Cookie holding a demo space's access code. Kept as a bare string here so the
// (edge) middleware can reference the same name without importing this module
// (which pulls in Prisma). If you change it, update middleware.ts too.
export const DEMO_COOKIE = "demo_code";

/**
 * The current request's data scope:
 * - `owner`: the authenticated account (GitHub session) — real data, demoCode null.
 * - `demo`: a visitor holding a valid demo access code — only that space's data.
 * Returns null when neither applies (unauthenticated / invalid code) so callers
 * can redirect to the sign-in screen.
 */
export type Scope =
  | { kind: "owner"; demoCode: null }
  | { kind: "demo"; demoCode: string; space: DemoSpace };

// Don't write lastSeenAt more than once per this window (getScope runs several
// times per navigation; this bounds the tracking writes).
const SEEN_THROTTLE_MS = 5 * 60_000;

export async function getScope(): Promise<Scope | null> {
  // The owner (GitHub session) always wins and sees real data.
  const session = await auth();
  if (session?.user) return { kind: "owner", demoCode: null };

  const code = (await cookies()).get(DEMO_COOKIE)?.value;
  if (code) {
    const space = await prisma.demoSpace.findUnique({ where: { code } });
    if (space) {
      void touchLastSeen(space);
      return { kind: "demo", demoCode: space.code, space };
    }
  }
  return null;
}

/** Bump lastSeenAt on activity, throttled. Best-effort — never blocks the page. */
async function touchLastSeen(space: DemoSpace): Promise<void> {
  const stale =
    !space.lastSeenAt ||
    Date.now() - space.lastSeenAt.getTime() > SEEN_THROTTLE_MS;
  if (!stale) return;
  try {
    await prisma.demoSpace.update({
      where: { code: space.code },
      data: { lastSeenAt: new Date() },
    });
  } catch {
    // tracking is non-critical
  }
}

/** Validate a demo access code and start the session (sets the cookie). */
export async function enterDemo(code: string): Promise<boolean> {
  const space = await prisma.demoSpace.findUnique({
    where: { code: code.trim() },
  });
  if (!space) return false;
  // Record the entry: first use, last activity, and a session/device count.
  await prisma.demoSpace.update({
    where: { code: space.code },
    data: {
      useCount: { increment: 1 },
      firstUsedAt: space.firstUsedAt ?? new Date(),
      lastSeenAt: new Date(),
    },
  });
  (await cookies()).set(DEMO_COOKIE, space.code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return true;
}

/** End a demo session. */
export async function exitDemo(): Promise<void> {
  (await cookies()).delete(DEMO_COOKIE);
}
