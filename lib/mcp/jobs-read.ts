import { z } from "zod";
import { ActionStatus, Prisma, Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLeadDescription, stripHtml } from "@/lib/format";
import { companyKey } from "@/lib/normalize";
import { err, text, type McpServer } from "@/lib/mcp/shared";

export function registerJobReadTools(server: McpServer) {
  server.registerTool(
    "search_jobs",
    {
      title: "Search jobs",
      description:
        "Search/filter all jobs in rolefetchr. Returns one line per job with its id (use get_job for full detail), score, title, company, source, and action status. Combine filters freely.",
      inputSchema: {
        query: z
          .string()
          .optional()
          .describe("Keyword matched in title, company, or tags."),
        source: z.nativeEnum(Source).optional(),
        minScore: z.number().int().min(0).max(100).optional(),
        eligible: z
          .boolean()
          .optional()
          .describe("Only jobs the agent flagged eligible (true) or not eligible (false)."),
        excludeCompany: z
          .array(z.string())
          .optional()
          .describe('Companies to leave out of this query (matched on the normalized name, so "Huzzle Ltd" also excludes "huzzle").'),
        missingDescription: z
          .boolean()
          .optional()
          .describe("Only jobs whose description is empty or a placeholder lead — the ones needing a real posting (they don't show in get_unscored_jobs once scored)."),
        maxDescriptionChars: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Only jobs whose raw description is at most this many characters — catches truncated or scraper-junk descriptions."),
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
    async ({
      query, source, minScore, eligible, excludeCompany, missingDescription,
      maxDescriptionChars, status, freshHours, sort = "score", limit = 25, demoCode = null,
    }) => {
      const where: Prisma.JobWhereInput = { demoCode };
      if (source) where.source = source;
      const scoreIs: Prisma.JobScoreWhereInput = {};
      if (minScore != null) scoreIs.score = { gte: minScore };
      if (eligible != null) scoreIs.eligible = eligible;
      if (Object.keys(scoreIs).length > 0) where.score = { is: scoreIs };
      if (excludeCompany?.length)
        where.companyKey = { notIn: excludeCompany.map((c) => companyKey(c)) };
      if (status) where.action = { is: { status } };
      if (freshHours)
        where.fetchedAt = { gte: new Date(Date.now() - freshHours * 3600_000) };
      if (query)
        where.OR = [
          { title: { contains: query, mode: "insensitive" } },
          { company: { contains: query, mode: "insensitive" } },
          { tags: { has: query.toLowerCase() } },
        ];

      // Length filters need SQL length(); resolve candidate ids first with a
      // generous raw-length cap (HTML markup inflates raw length), then apply
      // the precise placeholder check in JS before the main query.
      if (missingDescription || maxDescriptionChars != null) {
        const cap = Math.min(
          missingDescription ? 800 : Number.MAX_SAFE_INTEGER,
          maxDescriptionChars ?? Number.MAX_SAFE_INTEGER,
        );
        const rows = await prisma.$queryRaw<Array<{ id: string; description: string }>>`
          SELECT id, description FROM "Job"
          WHERE "demoCode" IS NOT DISTINCT FROM ${demoCode}
            AND length(description) <= ${cap}
          LIMIT 5000`;
        const candidates = missingDescription
          ? rows.filter((r) => isLeadDescription(r.description))
          : rows;
        where.id = { in: candidates.map((r) => r.id) };
      }

      const jobs = await prisma.job.findMany({
        where,
        orderBy:
          sort === "recent"
            ? { postedAt: "desc" }
            : { score: { score: "desc" } },
        take: limit,
        include: { score: true, action: true },
      });

      const describeLen = missingDescription || maxDescriptionChars != null;
      const lines = jobs.map(
        (j) =>
          `[${j.id}] ${j.score ? `${j.score.score}/100` : "unscored"} · ${j.title} @ ${j.company} · ${j.sourceLabel ?? j.source}${j.action ? ` · ${j.action.status}` : ""}${describeLen ? ` · desc ${stripHtml(j.description).length} chars` : ""}`,
      );
      return text(lines.length ? lines.join("\n") : "No jobs match.");
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
      if (!job) return err(`No job with id ${id}.`);
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
      return text(lines.join("\n"));
    },
  );

  server.registerTool(
    "recent_matches",
    {
      title: "Recent matches",
      description:
        "List the top scored jobs in rolefetchr (across all sources), best CV-fit first. Use to check what's already there before adding, or to review current matches. Pass `since` to see only what was scored after a given moment (e.g. \"what appeared above 60 since yesterday\").",
      inputSchema: {
        limit: z.number().int().min(1).max(50).optional(),
        minScore: z.number().int().min(0).max(100).optional(),
        since: z
          .string()
          .optional()
          .describe("ISO date/datetime; only jobs scored at or after this moment."),
      },
    },
    async ({ limit = 15, minScore = 30, since }) => {
      const scoreIs: Prisma.JobScoreWhereInput = { score: { gte: minScore } };
      if (since) {
        const date = new Date(since);
        if (Number.isNaN(date.getTime())) return err(`Invalid since date: ${since}`);
        scoreIs.evaluatedAt = { gte: date };
      }
      const jobs = await prisma.job.findMany({
        where: { score: { is: scoreIs } },
        orderBy: { score: { score: "desc" } },
        take: limit,
        include: { score: true },
      });
      const lines = jobs.map(
        (j) =>
          `${j.score?.score}/100 · ${j.title} @ ${j.company} · ${j.sourceLabel ?? j.source} · scored ${j.score?.evaluatedAt.toISOString().slice(0, 10)} · ${j.sourceUrl}`,
      );
      return text(
        lines.length
          ? lines.join("\n")
          : `No jobs scored ${minScore}+${since ? ` since ${since}` : ""} yet.`,
      );
    },
  );

  server.registerTool(
    "stats",
    {
      title: "Stats",
      description:
        "Overview of rolefetchr: totals, jobs per source, score distribution, scored vs unscored, action counts, and the latest ingestion run per source (health).",
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

      return text(
        `Total jobs: ${total} · scored: ${scores.length} · unscored: ${total - scores.length}\n` +
          `By source: ${bySource.map((s) => `${s.source}=${s._count}`).join(", ")}\n` +
          `Score buckets: ${JSON.stringify(buckets)}\n` +
          `Actions: ${byStatus.map((s) => `${s.status}=${s._count}`).join(", ") || "none"}\n` +
          `Latest ingest per source:\n` +
          [...lastRunBySource.values()]
            .map((r) => `  ${r.source}: new=${r.jobsNew} fetched=${r.jobsFetched}${r.error ? ` ERROR: ${r.error}` : ""} (${r.startedAt.toISOString()})`)
            .join("\n"),
      );
    },
  );
}
