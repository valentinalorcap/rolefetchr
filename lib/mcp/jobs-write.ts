import { z } from "zod";
import { ActionStatus, Prisma, Source, WorkMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addManualJob, describeAddResult, type AddJobResult } from "@/lib/manual-ingest";
import { fetchJobDescription } from "@/lib/description-fetch";
import { isLeadDescription, isLowInformation, stripHtml } from "@/lib/format";
import { DESCRIPTION_GUIDANCE, err, text, type McpServer } from "@/lib/mcp/shared";

function addResultLines(title: string, r: AddJobResult): string[] {
  const lines = [`${r.isNew ? "Added" : "Updated"} "${title}" — ${describeAddResult(r)}. [${r.jobId}]`];
  if (r.duplicates.length) {
    lines.push(
      `  ⚠ Likely same posting under other URLs: ${r.duplicates
        .map((d) => `[${d.id}] ${d.location ?? "?"} ${d.url}`)
        .join(" · ")}`,
    );
  }
  return lines;
}

export function registerJobWriteTools(server: McpServer) {
  server.registerTool(
    "add_job",
    {
      title: "Add a job",
      description:
        "Add a job from a site rolefetchr can't scrape (LinkedIn, Welcome to the Jungle, Jobgether, etc.). Deduped by URL; on a dedupe hit incoming data can only improve the record (a placeholder never overwrites a real description; salary/location only fill blanks) and the response details what changed. If a real description replaces an empty one, the stale score is cleared for re-scoring. Also reports other jobs that look like the same posting under a different URL. The app does NOT score — score with set_job_score (read get_scoring_config + get_cv first).",
      inputSchema: {
        platform: z
          .string()
          .describe('The site the job is from, e.g. "LinkedIn", "Jobgether".'),
        url: z.string().url().describe("The job posting URL (used to dedupe)."),
        title: z.string().describe("Job title."),
        company: z.string().describe("Hiring company."),
        description: z
          .string()
          .optional()
          .describe(
            `Optional — omit for a title+link lead (the job shows as a Lead until a real description arrives; use fetch_job_description or pass it later). ${DESCRIPTION_GUIDANCE}`,
          ),
        location: z.string().optional(),
        salary: z.string().optional(),
        tags: z.array(z.string()).optional(),
        postedAt: z
          .string()
          .optional()
          .describe("ISO date the job was posted; defaults to now."),
        demoCode: z
          .string()
          .optional()
          .describe(
            "Add this job to a demo space (a DemoSpace.code) instead of the owner's real data. Demo jobs are fully isolated. Omit for normal jobs.",
          ),
        source: z
          .nativeEnum(Source)
          .optional()
          .describe(
            "Catalogued source (defaults to MANUAL). For demo data, vary it (REMOTEOK, JSEARCH, EMAIL, …) so the Sources sidebar looks realistic.",
          ),
        workMode: z
          .nativeEnum(WorkMode)
          .optional()
          .describe(
            "How the role is worked: REMOTE (default), HYBRID, or ONSITE. Set it explicitly when the posting says so; HYBRID/ONSITE jobs get a distinct badge in the UI. When omitted it's detected from location/title/tags.",
          ),
      },
    },
    async (input) => {
      const result = await addManualJob(input);
      const lines = addResultLines(input.title, result);
      if (result.isNew || result.scoreCleared) {
        lines.push(`Unscored — call set_job_score with this id. View: /jobs/${result.jobId}`);
      }
      return text(lines.join("\n"));
    },
  );

  server.registerTool(
    "add_jobs",
    {
      title: "Add jobs in batch",
      description:
        "Add several jobs in one call — same per-job fields and dedupe rules as add_job (quality-guarded overwrites, lastSeenAt bump, score cleared when a real description replaces a placeholder, duplicate reporting). Use this instead of many add_job calls when processing an email or a scrape. One invalid job doesn't sink the rest.",
      inputSchema: {
        jobs: z
          .array(
            z.object({
              platform: z.string(),
              url: z.string().url(),
              title: z.string(),
              company: z.string(),
              description: z.string().optional().describe(DESCRIPTION_GUIDANCE),
              location: z.string().optional(),
              salary: z.string().optional(),
              tags: z.array(z.string()).optional(),
              postedAt: z.string().optional(),
              source: z.nativeEnum(Source).optional(),
              workMode: z.nativeEnum(WorkMode).optional(),
            }),
          )
          .min(1)
          .max(25),
        demoCode: z
          .string()
          .optional()
          .describe("Add the whole batch to a demo space instead of real data."),
      },
    },
    async ({ jobs, demoCode }) => {
      const lines: string[] = [];
      let created = 0;
      let updated = 0;
      let failed = 0;
      for (const job of jobs) {
        try {
          const result = await addManualJob({ ...job, demoCode });
          if (result.isNew) created++;
          else updated++;
          lines.push(...addResultLines(job.title, result));
        } catch (e) {
          failed++;
          lines.push(`✗ "${job.title}" failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      lines.unshift(
        `${jobs.length} jobs → ${created} created, ${updated} updated${failed ? `, ${failed} FAILED` : ""}. New/re-opened ones are unscored — score them via get_unscored_jobs → set_job_scores.`,
      );
      return text(lines.join("\n"));
    },
  );

  server.registerTool(
    "update_job",
    {
      title: "Update a job",
      description:
        "Edit an existing job's fields by id (e.g. fix a title, description, location, or source) without recreating it. Only the fields you pass are changed. Does not change the score — re-run set_job_score if the change affects the fit.",
      inputSchema: {
        id: z.string().describe("The job id to update."),
        title: z.string().optional(),
        company: z.string().optional(),
        description: z.string().optional().describe(DESCRIPTION_GUIDANCE),
        location: z.string().nullable().optional(),
        salary: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
        platform: z
          .string()
          .optional()
          .describe("The displayed platform/source label (sourceLabel)."),
        source: z
          .nativeEnum(Source)
          .optional()
          .describe("The catalogued source (affects the Sources sidebar)."),
        url: z.string().url().optional().describe("The posting URL (sourceUrl)."),
        postedAt: z.string().optional().describe("ISO date the job was posted."),
      },
    },
    async ({ id, platform, url, postedAt, ...rest }) => {
      const job = await prisma.job.findUnique({ where: { id }, select: { id: true } });
      if (!job) return err(`No job with id ${id}.`);
      const data: Prisma.JobUpdateInput = {};
      for (const [k, v] of Object.entries(rest)) {
        if (v !== undefined) (data as Record<string, unknown>)[k] = v;
      }
      if (platform !== undefined) data.sourceLabel = platform;
      if (url !== undefined) data.sourceUrl = url;
      if (postedAt !== undefined) data.postedAt = new Date(postedAt);
      if (Object.keys(data).length === 0) return err("Nothing to update.");
      await prisma.job.update({ where: { id }, data });
      return text(`Updated ${Object.keys(data).join(", ")} on job ${id}.`);
    },
  );

  server.registerTool(
    "fetch_job_description",
    {
      title: "Fetch a job's description",
      description:
        "Open a job's source URL server-side, extract the posting's description, store it on the job, and return it — one step, so a posting can't be read without being saved. Prefers the page's schema.org JobPosting data (verified); falls back to the page content (stored as unverified). If a real description lands where an empty/placeholder one was, the stale score is cleared for re-scoring. Best-effort: pages behind auth walls (e.g. LinkedIn) may fail — the job is then flagged descriptionUnverified and you should paste the description via add_job/update_job instead.",
      inputSchema: {
        jobId: z.string(),
        descriptionChars: z
          .number()
          .int()
          .min(200)
          .max(8000)
          .optional()
          .describe("Cap on the returned plain-text description (default 4000)."),
      },
    },
    async ({ jobId, descriptionChars = 4000 }) => {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          title: true,
          sourceUrl: true,
          description: true,
          descriptionUnverified: true,
        },
      });
      if (!job) return err(`No job with id ${jobId}.`);

      const storedIsLead = !job.description.trim() || isLeadDescription(job.description);
      const result = await fetchJobDescription(job.sourceUrl);
      if (!result.ok) {
        // Only flag when there's no confirmed content — a failed re-fetch must
        // not downgrade a description that was already good.
        if (storedIsLead) {
          await prisma.job.update({
            where: { id: jobId },
            data: { descriptionUnverified: true },
          });
        }
        return err(
          `Could not fetch the description for "${job.title}" (${job.sourceUrl}): ${result.error}\n` +
            `${storedIsLead ? "Flagged descriptionUnverified. " : "The stored description is untouched. "}` +
            `Open the posting yourself and pass the description via add_job or update_job.`,
        );
      }

      // Trust order: verified (JSON-LD / agent text) beats unverified page
      // content regardless of length; length only breaks ties within a level;
      // low-information junk never wins over real content.
      const incomingVerified = result.via === "json-ld";
      let improves: boolean;
      if (isLowInformation(result.description) && !storedIsLead) {
        improves = false;
      } else if (storedIsLead) {
        improves = true;
      } else if (incomingVerified) {
        improves = job.descriptionUnverified || result.description.length > job.description.length;
      } else {
        // Unverified content only replaces unverified content, and only if longer.
        improves = job.descriptionUnverified && result.description.length > job.description.length;
      }
      const scoreCleared = storedIsLead && improves && !isLeadDescription(result.description);
      if (improves) {
        await prisma.job.update({
          where: { id: jobId },
          data: {
            description: result.description,
            descriptionUnverified: !incomingVerified,
          },
        });
        if (scoreCleared) await prisma.jobScore.deleteMany({ where: { jobId } });
      }

      const stored = improves ? result.description : job.description;
      return text(
        [
          improves
            ? `Fetched and stored the description for "${job.title}" (via ${result.via}${result.via === "content" ? ", flagged unverified" : ""}).`
            : `Fetched "${job.title}" but the stored description is better — kept it.`,
          scoreCleared ? "Stale score cleared — re-score this job." : null,
          "",
          stripHtml(stored).slice(0, descriptionChars),
        ]
          .filter((l): l is string => l !== null)
          .join("\n"),
      );
    },
  );

  server.registerTool(
    "set_job_action",
    {
      title: "Set job action",
      description:
        "Manage the pipeline for a job: mark it SAVED / APPLIED / NOT_INTERESTED / INTERVIEW / REJECTED with an optional note. NOT_INTERESTED archives the job (it moves to the Archived tab and is hidden from the main views). Use status CLEAR to remove any action.",
      inputSchema: {
        jobId: z.string(),
        status: z
          .enum(["SAVED", "APPLIED", "NOT_INTERESTED", "INTERVIEW", "REJECTED", "CLEAR"])
          .describe("CLEAR removes the current action."),
        notes: z.string().optional(),
      },
    },
    async ({ jobId, status, notes }) => {
      if (status === "CLEAR") {
        await prisma.jobAction.deleteMany({ where: { jobId } });
        return text(`Cleared action on ${jobId}.`);
      }
      await prisma.jobAction.upsert({
        where: { jobId },
        create: { jobId, status: status as ActionStatus, notes: notes ?? null },
        update: { status: status as ActionStatus, ...(notes !== undefined ? { notes } : {}) },
      });
      return text(`Marked ${jobId} as ${status}${notes ? ` (note saved)` : ""}.`);
    },
  );
}
