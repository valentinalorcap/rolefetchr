import { NextResponse } from "next/server";
import { ingestAll, selectSources, type SourceSelection } from "@/lib/ingest";
import { sources } from "@/lib/sources";

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

// `?only=JSEARCH` / `?except=JSEARCH,ADZUNA` — comma-separated Source names.
function parseNames(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((name) => name.trim().toUpperCase())
    .filter(Boolean);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A slow source gets its own invocation (and time budget) by splitting the
  // run: one call with `only`, another with `except`.
  const params = new URL(req.url).searchParams;
  const selection: SourceSelection = {
    only: parseNames(params.get("only")),
    except: parseNames(params.get("except")),
  };
  try {
    selectSources(sources, selection);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }

  const startedAt = Date.now();
  const results = await ingestAll(selection);
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
