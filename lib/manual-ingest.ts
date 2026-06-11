import { Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { scoreJob, SCORING_MODEL, type JobScoreResult } from "@/lib/scorer";

export interface ManualJobInput {
  platform: string;
  url: string;
  title: string;
  company: string;
  description: string;
  location?: string;
  salary?: string;
  tags?: string[];
  postedAt?: string;
}

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * Add (or refresh) a manually-sourced job — e.g. a LinkedIn link an external
 * agent passes in over MCP — and score it against the CV with the same rubric
 * as every other source. Deduped by (MANUAL, url). Returns the persisted score.
 */
export async function addManualJob(input: ManualJobInput): Promise<{
  jobId: string;
  isNew: boolean;
  score: JobScoreResult;
}> {
  const postedAt = input.postedAt ? new Date(input.postedAt) : new Date();
  const fields = {
    sourceLabel: input.platform,
    title: input.title,
    company: input.company,
    description: input.description,
    location: input.location ?? null,
    salary: input.salary ?? null,
    tags: input.tags ?? [],
  };

  const existing = await prisma.job.findUnique({
    where: { source_externalId: { source: Source.MANUAL, externalId: input.url } },
    select: { id: true },
  });

  const job = await prisma.job.upsert({
    where: { source_externalId: { source: Source.MANUAL, externalId: input.url } },
    create: {
      source: Source.MANUAL,
      externalId: input.url,
      sourceUrl: input.url,
      remote: true,
      postedAt,
      ...fields,
    },
    update: fields,
  });

  const result = await scoreJob(job);

  await prisma.jobScore.upsert({
    where: { jobId: job.id },
    create: {
      jobId: job.id,
      score: clampScore(result.score),
      reasoning: result.reasoning,
      matchedSkills: result.matchedSkills,
      gaps: result.gaps,
      model: SCORING_MODEL,
    },
    update: {
      score: clampScore(result.score),
      reasoning: result.reasoning,
      matchedSkills: result.matchedSkills,
      gaps: result.gaps,
      model: SCORING_MODEL,
      evaluatedAt: new Date(),
    },
  });

  return { jobId: job.id, isNew: existing === null, score: result };
}
