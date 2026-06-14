import { Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

/**
 * Add (or refresh) a manually-sourced job — e.g. a LinkedIn link an external
 * agent passes in over MCP. Deduped by (MANUAL, url). The app no longer scores;
 * the job is left unscored for the external agent to score over MCP
 * (get_unscored_jobs → set_job_score).
 */
export async function addManualJob(input: ManualJobInput): Promise<{
  jobId: string;
  isNew: boolean;
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

  return { jobId: job.id, isNew: existing === null };
}
