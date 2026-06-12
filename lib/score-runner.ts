import { prisma } from "@/lib/prisma";
import { scoreJob, SCORING_MODEL } from "@/lib/scorer";
import { quickRejectByTitle } from "@/lib/title-filter";

export interface ScoreBatchResult {
  scored: number;
  filtered: number;
  failed: number;
  remaining: number;
}

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Score a batch of unscored jobs (freshest first).
 *
 * Jobs whose title clearly isn't a software match are rejected by a cheap regex
 * and persisted with score 0 — no Sonnet call. The rest are scored with Sonnet,
 * up to `sonnetLimit` per run (to bound runtime/cost); any beyond that are left
 * for the next run. We scan a wider window (`scanLimit`) so the free rejects
 * drain quickly without spending extra model calls.
 */
export async function scoreBatch(
  sonnetLimit = 6,
  scanLimit = 40,
): Promise<ScoreBatchResult> {
  const jobs = await prisma.job.findMany({
    where: { score: null },
    orderBy: { postedAt: "desc" },
    take: scanLimit,
  });

  const toScore: typeof jobs = [];
  const rejected: { jobId: string; reason: string }[] = [];
  for (const job of jobs) {
    const reason = quickRejectByTitle(job.title);
    if (reason) rejected.push({ jobId: job.id, reason });
    else toScore.push(job);
  }

  // Persist all title-filtered jobs at once (no model call).
  if (rejected.length > 0) {
    await prisma.jobScore.createMany({
      data: rejected.map((r) => ({
        jobId: r.jobId,
        score: 0,
        reasoning: `Auto-skipped before scoring: ${r.reason}.`,
        matchedSkills: [],
        gaps: [],
        model: "title-filter",
      })),
      skipDuplicates: true,
    });
  }

  let scored = 0;
  let failed = 0;
  for (const job of toScore.slice(0, sonnetLimit)) {
    try {
      const result = await scoreJob(job);
      await prisma.jobScore.create({
        data: {
          jobId: job.id,
          score: clampScore(result.score),
          eligible: result.eligible,
          reasoning: result.reasoning,
          matchedSkills: result.matchedSkills,
          gaps: result.gaps,
          model: SCORING_MODEL,
        },
      });
      scored += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to score job ${job.id} (${job.title}): ${message}`);
    }
  }

  const remaining = await prisma.job.count({ where: { score: null } });
  return { scored, filtered: rejected.length, failed, remaining };
}
