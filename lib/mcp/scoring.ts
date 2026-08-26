import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCvText, getScoringConfig, updateScoringConfig } from "@/lib/cv-context";
import { stripHtml } from "@/lib/format";
import { getMutedKeys } from "@/lib/muted-sources";
import { err, json, text, type McpServer } from "@/lib/mcp/shared";

export function registerScoringTools(server: McpServer) {
  server.registerTool(
    "get_unscored_jobs",
    {
      title: "Get unscored jobs",
      description:
        "List jobs that have no CV-fit score yet, with the full content needed to score them (title, company, location, salary, tags, description, url). Returns JSON. Freshest first. Each job carries its dedupe fingerprint; jobs sharing one in the same batch are the same posting reposted (score once, reuse). When scoredDuplicate is set, the same posting was already scored under another URL — reuse that score, but RE-EVALUATE eligibility whenever this copy's location OR workMode differs from the duplicate's (the same ad can be (Remote) in one country and (Hybrid) elsewhere, with opposite eligibility). Score with set_job_scores (batch); read get_scoring_config + get_cv first. Pass demoCode to score a demo space's jobs.",
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
      // Muted publishers (repost bots) are hidden from the scoring loop.
      const muted = await getMutedKeys();
      const where: Prisma.JobWhereInput = {
        score: null,
        demoCode,
        ...(muted.size ? { NOT: { companyKey: { in: [...muted] } } } : {}),
      };
      const jobs = await prisma.job.findMany({
        where,
        orderBy: { postedAt: "desc" },
        take: limit,
      });
      const remaining = await prisma.job.count({ where });

      // The same posting often exists under other URLs (per-city reposts). If a
      // fingerprint sibling is already scored, hand the agent that score so it
      // can reuse it instead of scoring the same ad again.
      const fingerprints = [...new Set(jobs.map((j) => j.fingerprint).filter((f): f is string => !!f))];
      const scoredSiblings = fingerprints.length
        ? await prisma.job.findMany({
            where: { fingerprint: { in: fingerprints }, demoCode, score: { isNot: null } },
            select: {
              id: true,
              fingerprint: true,
              location: true,
              workMode: true,
              score: { select: { score: true, eligible: true } },
            },
          })
        : [];
      const siblingByFingerprint = new Map(
        scoredSiblings.map((s) => [s.fingerprint as string, s]),
      );

      const payload = jobs.map((j) => {
        const sibling = j.fingerprint ? siblingByFingerprint.get(j.fingerprint) : undefined;
        return {
          id: j.id,
          title: j.title,
          company: j.company,
          source: j.sourceLabel ?? j.source,
          location: j.location,
          salary: j.salary,
          tags: j.tags,
          url: j.sourceUrl,
          postedAt: j.postedAt.toISOString(),
          workMode: j.workMode,
          fingerprint: j.fingerprint,
          scoredDuplicate: sibling
            ? {
                jobId: sibling.id,
                location: sibling.location,
                workMode: sibling.workMode,
                score: sibling.score?.score,
                eligible: sibling.score?.eligible,
              }
            : null,
          description: stripHtml(j.description).slice(0, descriptionChars),
        };
      });
      return json({ returned: payload.length, remainingUnscored: remaining, jobs: payload });
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
      if (!job) return err(`No job with id ${jobId}.`);
      await prisma.jobScore.upsert({
        where: { jobId },
        create: { jobId, score, eligible, reasoning, matchedSkills, gaps, model },
        update: { score, eligible, reasoning, matchedSkills, gaps, model, evaluatedAt: new Date() },
      });
      return text(
        `Scored "${job.title}" ${score}/100${eligible ? "" : " (not eligible)"}. [${jobId}]`,
      );
    },
  );

  server.registerTool(
    "set_job_scores",
    {
      title: "Set job scores in batch",
      description:
        "Write CV-fit scores for many jobs in one call — same semantics per item as set_job_score. Use this for the daily scoring loop instead of one call per job. An unknown jobId doesn't sink the rest; failures are listed in the response.",
      inputSchema: {
        scores: z
          .array(
            z.object({
              jobId: z.string(),
              score: z.number().int().min(0).max(100),
              eligible: z.boolean(),
              reasoning: z.string(),
              matchedSkills: z.array(z.string()).optional(),
              gaps: z.array(z.string()).optional(),
            }),
          )
          .min(1)
          .max(100),
        model: z
          .string()
          .optional()
          .describe('Label for who scored the batch; defaults to "agent".'),
      },
    },
    async ({ scores, model = "agent" }) => {
      const failures: string[] = [];
      let written = 0;
      let notEligible = 0;
      for (const s of scores) {
        const job = await prisma.job.findUnique({
          where: { id: s.jobId },
          select: { id: true },
        });
        if (!job) {
          failures.push(`✗ no job with id ${s.jobId}`);
          continue;
        }
        const data = {
          score: s.score,
          eligible: s.eligible,
          reasoning: s.reasoning,
          matchedSkills: s.matchedSkills ?? [],
          gaps: s.gaps ?? [],
          model,
        };
        await prisma.jobScore.upsert({
          where: { jobId: s.jobId },
          create: { jobId: s.jobId, ...data },
          update: { ...data, evaluatedAt: new Date() },
        });
        written++;
        if (!s.eligible) notEligible++;
      }
      const summary = `Wrote ${written}/${scores.length} scores (${notEligible} not eligible)${failures.length ? `, ${failures.length} failed` : ""}.`;
      return text([summary, ...failures].join("\n"));
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
      return text(
        `=== RUBRIC ===\n${cfg.rubric}\n\n` +
          `=== CANDIDATE CONTEXT ===\n${cfg.candidateContext ?? "(none)"}\n\n` +
          `(updated ${cfg.updatedAt.toISOString()})`,
      );
    },
  );

  server.registerTool(
    "update_scoring_config",
    {
      title: "Update scoring config",
      description:
        "Update the scoring rubric, the extra candidate context (e.g. work-authorization, preferences, deal-breakers), and/or the CV text jobs are scored against. All fields are optional and partial — pass only what you want to change. Takes effect on the next scoring run; call rescore_all to re-score existing jobs. The rubric should keep instructing the model to return score/reasoning/matchedSkills/gaps.",
      inputSchema: {
        rubric: z
          .string()
          .optional()
          .describe("Full replacement rubric text."),
        candidateContext: z
          .string()
          .optional()
          .describe("Extra context about the candidate to inform scoring."),
        cv: z
          .string()
          .optional()
          .describe("Full replacement CV text (what get_cv returns)."),
      },
    },
    async ({ rubric, candidateContext, cv }) => {
      if (rubric === undefined && candidateContext === undefined && cv === undefined) {
        return err("Nothing to update.");
      }
      await updateScoringConfig({ rubric, candidateContext, cv });
      return text(
        `Scoring config updated${rubric ? " (rubric)" : ""}${candidateContext !== undefined ? " (candidateContext)" : ""}${cv !== undefined ? " (cv)" : ""}. New jobs use it immediately; call rescore_all to re-score existing ones.`,
      );
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
      if (!confirm) return text("Not confirmed — no scores cleared.");
      const { count } = await prisma.jobScore.deleteMany({});
      return text(
        `Cleared ${count} scores. All jobs are now unscored — re-score them via get_unscored_jobs → set_job_score.`,
      );
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
    async () => text(await getCvText()),
  );
}
