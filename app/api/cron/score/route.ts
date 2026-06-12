import { NextResponse } from "next/server";
import { scoreBatch } from "@/lib/score-runner";

// Prisma + Anthropic SDK need the Node runtime; never statically cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Max Sonnet scorings per invocation — keeps each run under maxDuration
// (~6s/job) and bounds per-run cost. scoreBatch also title-filters obvious
// non-matches for free (no model call), so a run can clear more than this.
const BATCH_SIZE = 6;

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
  const result = await scoreBatch(BATCH_SIZE);

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    ...result,
  });
}
