import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { ActionStatus, Prisma, Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addManualJob } from "@/lib/manual-ingest";
import { getCvText, getScoringConfig, updateScoringConfig } from "@/lib/cv-context";
import { stripHtml } from "@/lib/format";

// Prisma + the Anthropic SDK need the Node runtime; scoring takes a few seconds.
export const runtime = "nodejs";
export const maxDuration = 60;

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      "add_job",
      {
        title: "Add a job",
        description:
          "Add a job from a site job-matchmaker can't scrape (LinkedIn, Welcome to the Jungle, Jobgether, etc.). It is deduped by URL, scored 0-100 against Valentina's CV with the same rubric as every other source, and shown in the app. Returns the CV-fit score and reasoning.",
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
        },
      },
      async (input) => {
        const { jobId, isNew, score } = await addManualJob(input);
        const verb = isNew ? "Added" : "Updated";
        return {
          content: [
            {
              type: "text",
              text:
                `${verb} "${input.title}" at ${input.company} (${input.platform}).\n` +
                `CV fit: ${Math.round(score.score)}/100\n` +
                `Reasoning: ${score.reasoning}\n` +
                `Matched: ${score.matchedSkills.join(", ") || "—"}\n` +
                `Gaps: ${score.gaps.join(", ") || "—"}\n` +
                `View: /jobs/${jobId}`,
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
        title: "Re-score all jobs",
        description:
          "Clear every existing CV-fit score so all jobs get re-scored with the current rubric by the background scorer (over the next runs). Use after changing the rubric or candidate context. Costs API credits — confirm intent.",
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
              text: `Cleared ${count} scores. The background scorer will re-score them with the current rubric over the next runs.`,
            },
          ],
        };
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
        },
      },
      async ({ query, source, minScore, status, freshHours, sort = "score", limit = 25 }) => {
        const where: Prisma.JobWhereInput = {};
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
          "Manage the pipeline for a job: mark it SAVED / APPLIED / NOT_INTERESTED / INTERVIEW / REJECTED with an optional note. Use status CLEAR to remove any action.",
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
