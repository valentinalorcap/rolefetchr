import { NextResponse } from "next/server";
import { extractJobsFromEmail, ingestEmailJobs } from "@/lib/email-ingest";

// Prisma + Anthropic need Node; extraction takes a few seconds.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Same shared secret as the crons (the Apps Script sends it).
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { provider?: string; subject?: string; html?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const html = body.html?.trim();
  if (!html) {
    return NextResponse.json({ error: "Missing 'html'" }, { status: 400 });
  }
  const provider = (body.provider || "Email").trim();

  try {
    const jobs = await extractJobsFromEmail(html);
    const result = await ingestEmailJobs(provider, jobs);
    return NextResponse.json({ ok: true, provider, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
