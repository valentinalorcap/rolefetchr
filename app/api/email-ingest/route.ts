import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cap stored HTML so a runaway email can't bloat a row.
const MAX_HTML_CHARS = 200_000;

// Same shared secret as the crons (the Gmail Apps Script sends it).
function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Store a forwarded job-alert email verbatim for an external agent to process.
 * No AI here — the agent fetches pending emails over MCP (list_pending_emails),
 * extracts the jobs itself, adds them (add_job), and marks the email processed.
 */
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

  const pending = await prisma.pendingEmail.create({
    data: {
      provider: (body.provider || "Email").trim(),
      subject: body.subject?.trim() || null,
      html: html.slice(0, MAX_HTML_CHARS),
    },
  });

  return NextResponse.json({ ok: true, id: pending.id });
}
