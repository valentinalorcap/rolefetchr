import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { ActionStatus, Prisma, Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addManualJob } from "@/lib/manual-ingest";
import { getCvText, getScoringConfig, updateScoringConfig } from "@/lib/cv-context";
import { stripHtml } from "@/lib/format";

// Prisma needs the Node runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "add_job",
      {
        title: "Add a job",
        description:
          "Add a job from a site job-matchmaker can't scrape (LinkedIn, Welcome to the Jungle, Jobgether, etc.). Deduped by URL. The app does NOT score — the job is added unscored; score it yourself with set_job_score (read get_scoring_config + get_cv for the rubric first). Returns the job id.",
        inputSchema: {
          platform: z
            .string()
            .describe('The site the job is from, e.g. "LinkedIn", "Jobgether".'),
          url: z.string().url().describe("The job posting URL (used to dedupe)."),
          title: z.string().describe("Job title."),
          company: z.string().describe("Hiring company."),
          description: z
            .string()
            .describe("Full job description (plain text or HTML)."),
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
              'Catalogued source (defaults to MANUAL). For demo data, vary it (REMOTEOK, JSEARCH, EMAIL, …) so the Sources sidebar looks realistic.',
            ),
        },
      },
      async (input) => {
        const { jobId, isNew } = await addManualJob(input);
        const verb = isNew ? "Added" : "Updated";
        return {
          content: [
            {
              type: "text",
              text:
                `${verb} "${input.title}" at ${input.company} (${input.platform}). [${jobId}]\n` +
                `Unscored — call set_job_score with this id to score it. View: /jobs/${jobId}`,
            },
          ],
        };
      },
    );

    server.registerTool(
      "get_unscored_jobs",
      {
        title: "Get unscored jobs",
        description:
          "List jobs that have no CV-fit score yet, with the full content needed to score them (title, company, location, salary, tags, description, url). Returns JSON. Freshest first. Score each one with set_job_score; read get_scoring_config + get_cv first so your scoring matches the rubric. This is the main loop for keeping matches up to date now that the app no longer scores with an LLM. Pass demoCode to score a demo space's jobs.",
        inputSchema: {
          limit: z
            .number()
            .int()
            .min(1)
            .max(50)
            .optional()
            .describe("Max jobs to return (default 20)."),
          descriptionChars: z
            .number()
            .int()
            .min(200)
            .max(8000)
            .optional()
            .describe("Cap on description length per job (default 4000)."),
          demoCode: z
            .string()
            .optional()
            .describe(
              "Scope to a demo space (a DemoSpace.code). Omit for the owner's real jobs.",
            ),
        },
      },
      async ({ limit = 20, descriptionChars = 4000, demoCode = null }) => {
        const where = { score: null, demoCode } as const;
        const jobs = await prisma.job.findMany({
          where,
          orderBy: { postedAt: "desc" },
          take: limit,
        });
        const remaining = await prisma.job.count({ where });
        const payload = jobs.map((j) => ({
          id: j.id,
          title: j.title,
          company: j.company,
          source: j.sourceLabel ?? j.source,
          location: j.location,
          salary: j.salary,
          tags: j.tags,
          url: j.sourceUrl,
          postedAt: j.postedAt.toISOString(),
          description: stripHtml(j.description).slice(0, descriptionChars),
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { returned: payload.length, remainingUnscored: remaining, jobs: payload },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "set_job_score",
      {
        title: "Set job score",
        description:
          "Write (or overwrite) the CV-fit score for a job you scored yourself. Use the rubric from get_scoring_config: score 0-100, eligible=false (and score ≤15) when the role requires relocation / on-site / a visa or work-authorization outside Spain. This is how scores get into the app now.",
        inputSchema: {
          jobId: z.string(),
          score: z.number().int().min(0).max(100),
          eligible: z
            .boolean()
            .describe(
              "False if the role requires something Valentina can't provide (relocation, on-site/hybrid, visa/residency/work-auth outside Spain). When false, score must be ≤15.",
            ),
          reasoning: z.string().describe("2-3 sentences grounding the score."),
          matchedSkills: z.array(z.string()).optional(),
          gaps: z.array(z.string()).optional(),
          model: z
            .string()
            .optional()
            .describe('Label for who scored it; defaults to "agent".'),
        },
      },
      async ({ jobId, score, eligible, reasoning, matchedSkills = [], gaps = [], model = "agent" }) => {
        const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, title: true } });
        if (!job) {
          return { content: [{ type: "text", text: `No job with id ${jobId}.` }], isError: true };
        }
        await prisma.jobScore.upsert({
          where: { jobId },
          create: { jobId, score, eligible, reasoning, matchedSkills, gaps, model },
          update: { score, eligible, reasoning, matchedSkills, gaps, model, evaluatedAt: new Date() },
        });
        return {
          content: [
            {
              type: "text",
              text: `Scored "${job.title}" ${score}/100${eligible ? "" : " (not eligible)"}. [${jobId}]`,
            },
          ],
        };
      },
    );

    server.registerTool(
      "recent_matches",
      {
        title: "Recent matches",
        description:
          "List the top scored jobs in job-matchmaker (across all sources), best CV-fit first. Use to check what's already there before adding, or to review current matches.",
        inputSchema: {
          limit: z.number().int().min(1).max(50).optional(),
          minScore: z.number().int().min(0).max(100).optional(),
        },
      },
      async ({ limit = 15, minScore = 30 }) => {
        const jobs = await prisma.job.findMany({
          where: { score: { is: { score: { gte: minScore } } } },
          orderBy: { score: { score: "desc" } },
          take: limit,
          include: { score: true },
        });
        const lines = jobs.map(
          (j) =>
            `${j.score?.score}/100 · ${j.title} @ ${j.company} · ${j.sourceLabel ?? j.source} · ${j.sourceUrl}`,
        );
        return {
          content: [
            {
              type: "text",
              text: lines.length
                ? lines.join("\n")
                : `No jobs scored ${minScore}+ yet.`,
            },
          ],
        };
      },
    );

    server.registerTool(
      "get_scoring_config",
      {
        title: "Get scoring config",
        description:
          "Read the current scoring rubric and extra candidate context used to score jobs against the CV. Read this before editing so you can refine it rather than overwrite blindly.",
        inputSchema: {},
      },
      async () => {
        const cfg = await getScoringConfig();
        return {
          content: [
            {
              type: "text",
              text:
                `=== RUBRIC ===\n${cfg.rubric}\n\n` +
                `=== CANDIDATE CONTEXT ===\n${cfg.candidateContext ?? "(none)"}\n\n` +
                `(updated ${cfg.updatedAt.toISOString()})`,
            },
          ],
        };
      },
    );

    server.registerTool(
      "update_scoring_config",
      {
        title: "Update scoring config",
        description:
          "Update the scoring rubric and/or the extra candidate context (e.g. work-authorization, preferences, deal-breakers). Both are optional and partial — pass only what you want to change. Takes effect on the next scoring run; call rescore_all to re-score existing jobs. The rubric should keep instructing the model to return score/reasoning/matchedSkills/gaps.",
        inputSchema: {
          rubric: z
            .string()
            .optional()
            .describe("Full replacement rubric text."),
          candidateContext: z
            .string()
            .optional()
            .describe("Extra context about the candidate to inform scoring."),
        },
      },
      async ({ rubric, candidateContext }) => {
        if (rubric === undefined && candidateContext === undefined) {
          return {
            content: [{ type: "text", text: "Nothing to update." }],
            isError: true,
          };
        }
        await updateScoringConfig({ rubric, candidateContext });
        return {
          content: [
            {
              type: "text",
              text: `Scoring config updated${rubric ? " (rubric)" : ""}${candidateContext !== undefined ? " (candidateContext)" : ""}. New jobs use it immediately; call rescore_all to re-score existing ones.`,
            },
          ],
        };
      },
    );

    server.registerTool(
      "rescore_all",
      {
        title: "Clear all scores",
        description:
          "Clear every existing CV-fit score so all jobs become unscored. Use after changing the rubric or candidate context, then re-score them yourself via get_unscored_jobs → set_job_score (the app no longer scores automatically). Confirm intent.",
        inputSchema: {
          confirm: z
            .boolean()
            .describe("Must be true to actually clear scores."),
        },
      },
      async ({ confirm }) => {
        if (!confirm) {
          return {
            content: [
              { type: "text", text: "Not confirmed — no scores cleared." },
            ],
          };
        }
        const { count } = await prisma.jobScore.deleteMany({});
        return {
          content: [
            {
              type: "text",
              text: `Cleared ${count} scores. All jobs are now unscored — re-score them via get_unscored_jobs → set_job_score.`,
            },
          ],
        };
      },
    );

    server.registerTool(
      "list_pending_emails",
      {
        title: "List pending emails",
        description:
          "List forwarded job-alert emails that haven't been processed yet, with their raw HTML. Extract the job postings from each (title, company, apply URL, location), add them with add_job (platform = the email's provider), then call mark_email_processed so they aren't returned again. This is how email-sourced jobs (LinkedIn, Jobgether, etc.) get into the app.",
        inputSchema: {
          limit: z.number().int().min(1).max(20).optional().describe("Max emails (default 5)."),
          htmlChars: z
            .number()
            .int()
            .min(1000)
            .max(200_000)
            .optional()
            .describe("Cap on HTML length per email (default 60000)."),
        },
      },
      async ({ limit = 5, htmlChars = 60_000 }) => {
        const emails = await prisma.pendingEmail.findMany({
          where: { processedAt: null },
          orderBy: { receivedAt: "asc" },
          take: limit,
        });
        const remaining = await prisma.pendingEmail.count({ where: { processedAt: null } });
        const payload = emails.map((e) => ({
          id: e.id,
          provider: e.provider,
          subject: e.subject,
          receivedAt: e.receivedAt.toISOString(),
          html: e.html.slice(0, htmlChars),
        }));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { returned: payload.length, remainingPending: remaining, emails: payload },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.registerTool(
      "mark_email_processed",
      {
        title: "Mark email processed",
        description:
          "Mark a pending email as processed (after you've extracted its jobs with add_job) so list_pending_emails won't return it again.",
        inputSchema: { id: z.string() },
      },
      async ({ id }) => {
        const existing = await prisma.pendingEmail.findUnique({ where: { id }, select: { id: true } });
        if (!existing) {
          return { content: [{ type: "text", text: `No pending email with id ${id}.` }], isError: true };
        }
        await prisma.pendingEmail.update({ where: { id }, data: { processedAt: new Date() } });
        return { content: [{ type: "text", text: `Marked email ${id} processed.` }] };
      },
    );

    server.registerTool(
      "search_jobs",
      {
        title: "Search jobs",
        description:
          "Search/filter all jobs in job-matchmaker. Returns one line per job with its id (use get_job for full detail), score, title, company, source, and action status. Combine filters freely.",
        inputSchema: {
          query: z
            .string()
            .optional()
            .describe("Keyword matched in title, company, or tags."),
          source: z.nativeEnum(Source).optional(),
          minScore: z.number().int().min(0).max(100).optional(),
          status: z.nativeEnum(ActionStatus).optional(),
          freshHours: z
            .number()
            .int()
            .min(1)
            .optional()
            .describe("Only jobs first seen within this many hours."),
          sort: z.enum(["recent", "score"]).optional(),
          limit: z.number().int().min(1).max(100).optional(),
          demoCode: z
            .string()
            .optional()
            .describe(
              "Scope to a demo space (a DemoSpace.code). Omit for the owner's real jobs.",
            ),
        },
      },
      async ({ query, source, minScore, status, freshHours, sort = "score", limit = 25, demoCode = null }) => {
        const where: Prisma.JobWhereInput = { demoCode };
        if (source) where.source = source;
        if (minScore != null) where.score = { is: { score: { gte: minScore } } };
        if (status) where.action = { is: { status } };
        if (freshHours)
          where.fetchedAt = { gte: new Date(Date.now() - freshHours * 3600_000) };
        if (query)
          where.OR = [
            { title: { contains: query, mode: "insensitive" } },
            { company: { contains: query, mode: "insensitive" } },
            { tags: { has: query.toLowerCase() } },
          ];

        const jobs = await prisma.job.findMany({
          where,
          orderBy:
            sort === "recent"
              ? { postedAt: "desc" }
              : { score: { score: "desc" } },
          take: limit,
          include: { score: true, action: true },
        });

        const lines = jobs.map(
          (j) =>
            `[${j.id}] ${j.score ? `${j.score.score}/100` : "unscored"} · ${j.title} @ ${j.company} · ${j.sourceLabel ?? j.source}${j.action ? ` · ${j.action.status}` : ""}`,
        );
        return {
          content: [
            { type: "text", text: lines.length ? lines.join("\n") : "No jobs match." },
          ],
        };
      },
    );

    server.registerTool(
      "get_job",
      {
        title: "Get job",
        description:
          "Full detail of one job by id: description, CV-fit score + reasoning + matched/gaps, action status and notes, and the apply URL.",
        inputSchema: { id: z.string() },
      },
      async ({ id }) => {
        const job = await prisma.job.findUnique({
          where: { id },
          include: { score: true, action: true },
        });
        if (!job) {
          return { content: [{ type: "text", text: `No job with id ${id}.` }], isError: true };
        }
        const lines = [
          `${job.title} @ ${job.company}`,
          `Source: ${job.sourceLabel ?? job.source} · ${job.location ?? "—"} · ${job.salary ?? "—"}`,
          `Posted: ${job.postedAt.toISOString()} · URL: ${job.sourceUrl}`,
          `Tags: ${job.tags.join(", ") || "—"}`,
          job.score
            ? `Score: ${job.score.score}/100\nReasoning: ${job.score.reasoning}\nMatched: ${job.score.matchedSkills.join(", ") || "—"}\nGaps: ${job.score.gaps.join(", ") || "—"}`
            : "Score: not scored yet",
          job.action ? `Action: ${job.action.status}${job.action.notes ? ` — ${job.action.notes}` : ""}` : "Action: none",
          `\nDescription:\n${stripHtml(job.description).slice(0, 4000)}`,
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      },
    );

    server.registerTool(
      "stats",
      {
        title: "Stats",
        description:
          "Overview of job-matchmaker: totals, jobs per source, score distribution, scored vs unscored, action counts, and the latest ingestion run per source (health).",
        inputSchema: {},
      },
      async () => {
        const [total, bySource, scores, byStatus, runs] = await Promise.all([
          prisma.job.count(),
          prisma.job.groupBy({ by: ["source"], _count: true }),
          prisma.jobScore.findMany({ select: { score: true } }),
          prisma.jobAction.groupBy({ by: ["status"], _count: true }),
          prisma.ingestionRun.findMany({
            orderBy: { startedAt: "desc" },
            take: 12,
          }),
        ]);
        const buckets = { "70+": 0, "50-69": 0, "30-49": 0, "<30": 0 };
        for (const s of scores)
          buckets[s.score >= 70 ? "70+" : s.score >= 50 ? "50-69" : s.score >= 30 ? "30-49" : "<30"]++;
        const lastRunBySource = new Map<string, (typeof runs)[number]>();
        for (const r of runs) if (!lastRunBySource.has(r.source)) lastRunBySource.set(r.source, r);

        return {
          content: [
            {
              type: "text",
              text:
                `Total jobs: ${total} · scored: ${scores.length} · unscored: ${total - scores.length}\n` +
                `By source: ${bySource.map((s) => `${s.source}=${s._count}`).join(", ")}\n` +
                `Score buckets: ${JSON.stringify(buckets)}\n` +
                `Actions: ${byStatus.map((s) => `${s.status}=${s._count}`).join(", ") || "none"}\n` +
                `Latest ingest per source:\n` +
                [...lastRunBySource.values()]
                  .map((r) => `  ${r.source}: new=${r.jobsNew} fetched=${r.jobsFetched}${r.error ? ` ERROR: ${r.error}` : ""} (${r.startedAt.toISOString()})`)
                  .join("\n"),
            },
          ],
        };
      },
    );

    server.registerTool(
      "get_cv",
      {
        title: "Get CV",
        description:
          "Return the CV text the scoring is based on. Use it to align the candidate context / rubric edits with what the app actually scores against.",
        inputSchema: {},
      },
      async () => ({ content: [{ type: "text", text: getCvText() }] }),
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
          return { content: [{ type: "text", text: `Cleared action on ${jobId}.` }] };
        }
        await prisma.jobAction.upsert({
          where: { jobId },
          create: { jobId, status: status as ActionStatus, notes: notes ?? null },
          update: { status: status as ActionStatus, ...(notes !== undefined ? { notes } : {}) },
        });
        return {
          content: [{ type: "text", text: `Marked ${jobId} as ${status}${notes ? ` (note saved)` : ""}.` }],
        };
      },
    );

    server.registerTool(
      "create_demo_space",
      {
        title: "Create a demo space",
        description:
          "Create a shareable, isolated demo of the whole app. Returns an access code to hand to one recipient — anyone with it sees a full, interactive copy of the app scoped only to this space's data (never the owner's data, never the MCP). Load that space's jobs with add_job (demoCode = the code, vary source for realism), then score them with set_job_score (demoCode via get_unscored_jobs). Provide your own `code` or let one be generated.",
        inputSchema: {
          label: z
            .string()
            .describe("Display name shown in the demo banner (the recipient)."),
          code: z
            .string()
            .min(3)
            .optional()
            .describe("The access code. If omitted, one is generated from the label."),
          message: z
            .string()
            .optional()
            .describe("Optional override for the demo banner copy."),
        },
      },
      async ({ label, code, message }) => {
        const finalCode =
          code?.trim() ||
          `${label.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "DEMO"}-${Math.floor(1000 + Math.random() * 9000)}`;
        const existing = await prisma.demoSpace.findUnique({ where: { code: finalCode }, select: { code: true } });
        if (existing) {
          return { content: [{ type: "text", text: `A demo space with code "${finalCode}" already exists.` }], isError: true };
        }
        await prisma.demoSpace.create({
          data: { code: finalCode, label, message: message ?? null },
        });
        return {
          content: [
            {
              type: "text",
              text:
                `Created demo space for "${label}". Access code: ${finalCode}\n` +
                `Add jobs with add_job (demoCode: "${finalCode}"), then score them with set_job_score.`,
            },
          ],
        };
      },
    );

    server.registerTool(
      "list_demo_spaces",
      {
        title: "List demo spaces",
        description: "List every demo space with its access code, label, and job count.",
        inputSchema: {},
      },
      async () => {
        const spaces = await prisma.demoSpace.findMany({ orderBy: { createdAt: "desc" } });
        if (spaces.length === 0) {
          return { content: [{ type: "text", text: "No demo spaces yet." }] };
        }
        const lines = await Promise.all(
          spaces.map(async (s) => {
            const jobs = await prisma.job.count({ where: { demoCode: s.code } });
            return `${s.code} · ${s.label} · ${jobs} job${jobs === 1 ? "" : "s"}`;
          }),
        );
        return { content: [{ type: "text", text: lines.join("\n") }] };
      },
    );

    server.registerTool(
      "delete_demo_space",
      {
        title: "Delete a demo space",
        description:
          "Delete a demo space and all of its jobs (and their scores/actions). Irreversible — confirm intent.",
        inputSchema: {
          code: z.string(),
          confirm: z.boolean().describe("Must be true to actually delete."),
        },
      },
      async ({ code, confirm }) => {
        if (!confirm) {
          return { content: [{ type: "text", text: "Not confirmed — nothing deleted." }] };
        }
        const space = await prisma.demoSpace.findUnique({ where: { code }, select: { code: true } });
        if (!space) {
          return { content: [{ type: "text", text: `No demo space with code ${code}.` }], isError: true };
        }
        const { count } = await prisma.job.deleteMany({ where: { demoCode: code } });
        await prisma.demoSpace.delete({ where: { code } });
        return { content: [{ type: "text", text: `Deleted demo space ${code} and its ${count} job${count === 1 ? "" : "s"}.` }] };
      },
    );
  },
  {},
  { basePath: "/api", maxDuration: 60, verboseLogs: false },
);

// Simple shared-token auth: MCP clients (Claude Code/Desktop) send the header.
function withAuth(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const token = process.env.MCP_TOKEN;
    if (!token || req.headers.get("authorization") !== `Bearer ${token}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return handler(req);
  };
}

const handler = withAuth(mcpHandler);

export { handler as GET, handler as POST };
