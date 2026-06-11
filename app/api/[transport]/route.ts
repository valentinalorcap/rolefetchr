import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { addManualJob } from "@/lib/manual-ingest";
import { getScoringConfig, updateScoringConfig } from "@/lib/cv-context";

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
