import { Source, WorkMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { companyKey, detectWorkMode, extractTechs, normalizeCountry, normalizeRegion } from "@/lib/normalize";

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
  // Tenant scope: when set, the job belongs to that demo space instead of the
  // owner's real data.
  demoCode?: string;
  // Override the catalogued source (defaults to MANUAL). Useful for demo data,
  // where varied sources populate the Sources sidebar realistically.
  source?: Source;
  // How the role is worked. When omitted it's detected from location/title/tags
  // (defaulting to REMOTE); HYBRID/ONSITE get a distinct badge in the UI.
  workMode?: WorkMode;
}

/**
 * Add (or refresh) a job an external agent passes in over MCP. Deduped by
 * (source, externalId). The app no longer scores; the job is left unscored for
 * the agent to score over MCP (get_unscored_jobs → set_job_score). Demo jobs
 * namespace their externalId by code so they can't collide with real jobs or
 * with another space.
 */
export async function addManualJob(input: ManualJobInput): Promise<{
  jobId: string;
  isNew: boolean;
}> {
  const postedAt = input.postedAt ? new Date(input.postedAt) : new Date();
  const source = input.source ?? Source.MANUAL;
  const externalId = input.demoCode
    ? `${input.demoCode}::${input.url}`
    : input.url;
  const fields = {
    sourceLabel: input.platform,
    title: input.title,
    company: input.company,
    description: input.description,
    location: input.location ?? null,
    salary: input.salary ?? null,
    tags: input.tags ?? [],
    demoCode: input.demoCode ?? null,
    // Derived filter columns — kept in sync on updates too.
    region: normalizeRegion(input.location),
    country: normalizeCountry(input.location),
    techs: extractTechs(input.title, input.tags ?? [], input.description),
    companyKey: companyKey(input.company),
    workMode:
      input.workMode ??
      detectWorkMode(input.location, input.title, input.tags ?? []),
  };

  const existing = await prisma.job.findUnique({
    where: { source_externalId: { source, externalId } },
    select: { id: true },
  });

  const job = await prisma.job.upsert({
    where: { source_externalId: { source, externalId } },
    create: {
      source,
      externalId,
      sourceUrl: input.url,
      remote: fields.workMode === WorkMode.REMOTE,
      postedAt,
      ...fields,
    },
    update: fields,
  });

  return { jobId: job.id, isNew: existing === null };
}
