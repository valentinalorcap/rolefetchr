import { prisma } from "@/lib/prisma";
import { scoreJob, SCORING_MODEL } from "@/lib/scorer";

export interface ScoreBatchResult {
  scored: number;
  failed: number;
  remaining: number;
}

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Score a batch of as-yet-unscored jobs (freshest first) and persist results.
 * Small batches per run keep cost and the cron's runtime bounded; the rest are
 * picked up on the next run. One failure doesn't abort the batch.
 */
export async function scoreBatch(limit = 8): Promise<ScoreBatchResult> {
  const jobs = await prisma.job.findMany({
    where: { score: null },
    orderBy: { postedAt: "desc" },
    take: limit,
  });

  let scored = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      const result = await scoreJob(job);
      await prisma.jobScore.create({
        data: {
          jobId: job.id,
          score: clampScore(result.score),
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
  return { scored, failed, remaining };
}
