import { NextResponse } from "next/server";
import { ingestAll } from "@/lib/ingest";

// Prisma needs the Node runtime; never statically cache a cron route.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
// CRON_SECRET is set, so the same check covers cron and manual triggers.
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const results = await ingestAll();
  const totals = results.reduce(
    (acc, r) => ({
      fetched: acc.fetched + r.jobsFetched,
      new: acc.new + r.jobsNew,
    }),
    { fetched: 0, new: 0 },
  );

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    totals,
    results,
  });
}
