import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SCORING_MODEL } from "@/lib/scorer";

const anthropic = new Anthropic();

// Job-alert emails are large HTML; cap to bound tokens. The links we need live
// in href attributes, so we keep the HTML (don't strip tags).
const MAX_EMAIL_CHARS = 60_000;

const ExtractSchema = z.object({
  jobs: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      url: z.string().describe("The job's view/apply URL."),
      location: z.string().optional(),
      description: z.string().optional().describe("Snippet if the email has one."),
    }),
  ),
});

export type ExtractedJob = z.infer<typeof ExtractSchema>["jobs"][number];

/** Pull every distinct job posting out of a job-alert email with Claude. */
export async function extractJobsFromEmail(html: string): Promise<ExtractedJob[]> {
  const res = await anthropic.messages.parse({
    model: SCORING_MODEL,
    max_tokens: 4096,
    thinking: { type: "disabled" },
    system:
      "You extract job postings from a job-alert email (LinkedIn, Welcome to the Jungle, Jobgether, etc.). Return every DISTINCT job: its title, company, the job's view/apply URL (the real href, not a tracking pixel), location if shown, and a short snippet if present. Ignore navigation, footers, ads, unsubscribe links, and 'see all N jobs' links. If there are no jobs, return an empty list.",
    output_config: { format: zodOutputFormat(ExtractSchema) },
    messages: [{ role: "user", content: html.slice(0, MAX_EMAIL_CHARS) }],
  });
  return res.parsed_output?.jobs ?? [];
}

// Strip query/hash so tracking-param variants of the same job dedupe.
function normalizeId(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export interface EmailIngestResult {
  extracted: number;
  added: number;
  existing: number;
}

/** Upsert extracted jobs as source EMAIL (sourceLabel = provider). Scoring is
 * left to the background cron. Deduped by normalized URL. */
export async function ingestEmailJobs(
  provider: string,
  jobs: ExtractedJob[],
): Promise<EmailIngestResult> {
  const byId = new Map<string, ExtractedJob & { externalId: string }>();
  for (const j of jobs) {
    if (!j.url || !j.title) continue;
    const externalId = normalizeId(j.url);
    byId.set(externalId, { ...j, externalId });
  }

  let added = 0;
  let existing = 0;
  for (const j of byId.values()) {
    const fields = {
      sourceLabel: provider,
      title: j.title.trim(),
      company: (j.company || "Unknown").trim(),
      description: j.description?.trim() ?? "",
      location: j.location?.trim() || null,
    };
    const prior = await prisma.job.findUnique({
      where: { source_externalId: { source: Source.EMAIL, externalId: j.externalId } },
      select: { id: true },
    });
    await prisma.job.upsert({
      where: { source_externalId: { source: Source.EMAIL, externalId: j.externalId } },
      create: {
        source: Source.EMAIL,
        externalId: j.externalId,
        sourceUrl: j.url,
        remote: true,
        postedAt: new Date(),
        ...fields,
      },
      update: fields,
    });
    if (prior) existing += 1;
    else added += 1;
  }

  return { extracted: jobs.length, added, existing };
}

export { SCORING_MODEL };
