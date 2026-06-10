import { NextResponse } from "next/server";
import { scoreBatch } from "@/lib/score-runner";

// Prisma + Anthropic SDK need the Node runtime; never statically cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How many jobs to score per invocation. Keep small to stay within maxDuration
// (~6s/job observed) and to bound per-run Anthropic cost; the hourly cron
// drains the backlog over time.
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
