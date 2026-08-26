import { prisma } from "@/lib/prisma";
import { sources, type JobSource } from "@/lib/sources";
import { isIrrelevant } from "@/lib/relevance-filter";
import { getMutedKeys } from "@/lib/muted-sources";
import { companyKey, detectWorkMode, extractTechs, jobFingerprint, normalizeCountry, normalizeRegion } from "@/lib/normalize";

export interface IngestResult {
  source: string;
  jobsFetched: number;
  jobsNew: number;
  error: string | null;
}

/**
 * Fetch one source and insert only jobs we haven't seen.
 * Dedup is by the unique (source, externalId) constraint: we look up existing
 * ids in one query, then bulk-insert the rest. Each run is logged to
 * IngestionRun (success or failure) so cron health is queryable.
 */
export async function ingestSource(src: JobSource): Promise<IngestResult> {
  const run = await prisma.ingestionRun.create({ data: { source: src.source } });

  try {
    const fetched = await src.fetchJobs();
    const muted = await getMutedKeys();
    // Free relevance gate: drop clearly non-software roles and muted repost
    // bots before storing, so they don't clutter the app or cost the external
    // scoring agent tokens. Then derive the normalized filter columns
    // (region/country/techs/company identity) — the facet filters and
    // universal search run on these.
    const jobs = fetched
      .filter((j) => !isIrrelevant(j.title) && !muted.has(companyKey(j.company)))
      .map((j) => ({
        ...j,
        region: normalizeRegion(j.location),
        country: normalizeCountry(j.location),
        techs: extractTechs(j.title, j.tags, j.description),
        companyKey: companyKey(j.company),
        workMode: detectWorkMode(j.location, j.title, j.tags),
        fingerprint: jobFingerprint(j.title, j.company),
      }));

    const existing = await prisma.job.findMany({
      where: {
        source: src.source,
        externalId: { in: jobs.map((j) => j.externalId) },
      },
      select: { externalId: true },
    });
    const existingIds = new Set(existing.map((e) => e.externalId));
    const fresh = jobs.filter((j) => !existingIds.has(j.externalId));

    // A job showing up again in its source's feed means it's still open.
    if (existingIds.size > 0) {
      await prisma.job.updateMany({
        where: { source: src.source, externalId: { in: [...existingIds] } },
        data: { lastSeenAt: new Date() },
      });
    }

    let jobsNew = 0;
    if (fresh.length > 0) {
      const created = await prisma.job.createMany({
        data: fresh,
        skipDuplicates: true,
      });
      jobsNew = created.count;
    }

    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { endedAt: new Date(), jobsFetched: fetched.length, jobsNew },
    });

    return { source: src.source, jobsFetched: fetched.length, jobsNew, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: { endedAt: new Date(), error: message },
    });
    return { source: src.source, jobsFetched: 0, jobsNew: 0, error: message };
  }
}

/** Run every source sequentially. One source failing doesn't stop the others. */
export async function ingestAll(): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const src of sources) {
    results.push(await ingestSource(src));
  }
  return results;
}
