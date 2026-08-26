import { Source, WorkMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isLeadDescription } from "@/lib/format";
import { companyKey, detectWorkMode, extractTechs, jobFingerprint, normalizeCountry, normalizeRegion } from "@/lib/normalize";

export interface ManualJobInput {
  platform: string;
  url: string;
  title: string;
  company: string;
  // Optional: a title+link lead is fine — the job shows as a Lead in the UI
  // until a real description arrives (which also clears any stale score).
  description?: string;
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

export interface AddJobResult {
  jobId: string;
  isNew: boolean;
  // Dedupe-hit reporting: which fields the incoming data overwrote, and which
  // it was NOT allowed to overwrite (the stored value was better).
  changed: string[];
  kept: string[];
  // True when a real description replaced an empty/placeholder one — the stale
  // score is wiped so the job comes back through get_unscored_jobs.
  scoreCleared: boolean;
  // Other jobs sharing this posting's fingerprint (same company + title under a
  // different URL — e.g. per-city reposts). Reported, never auto-merged.
  duplicates: Array<{ id: string; url: string; location: string | null }>;
}

const isBlank = (v: string | null | undefined): boolean => !v || !v.trim();

export interface JobContentFields {
  title: string;
  company: string;
  description: string;
  location: string | null;
  salary: string | null;
  tags: string[];
  workMode: WorkMode;
}

export interface MergeOutcome {
  merged: JobContentFields;
  changed: string[];
  kept: string[];
  scoreCleared: boolean;
}

/**
 * Pure dedupe-merge: decide, field by field, whether incoming data may
 * overwrite what's stored. Descriptions only improve (a placeholder never
 * replaces a real one); salary/location only fill blanks. When a real
 * description replaces an empty/placeholder one, the score must be cleared —
 * it was assigned without the actual posting in front of it.
 */
export function mergeJobFields(
  existing: JobContentFields,
  input: Pick<
    ManualJobInput,
    "title" | "company" | "description" | "location" | "salary" | "tags" | "workMode"
  >,
): MergeOutcome {
  const changed: string[] = [];
  const kept: string[] = [];
  const merged: JobContentFields = {
    title: input.title,
    company: input.company,
    description: existing.description,
    location: existing.location,
    salary: existing.salary,
    tags: input.tags ?? existing.tags,
    workMode: existing.workMode,
  };
  if (input.title !== existing.title) changed.push("title");
  if (input.company !== existing.company) changed.push("company");
  if (input.tags && input.tags.join("\n") !== existing.tags.join("\n")) changed.push("tags");

  const storedIsLead = isBlank(existing.description) || isLeadDescription(existing.description);
  if (input.description !== undefined && input.description !== existing.description) {
    if (storedIsLead || input.description.length > existing.description.length) {
      merged.description = input.description;
      changed.push("description");
    } else {
      kept.push("description");
    }
  }
  if (input.location !== undefined && input.location !== (existing.location ?? "")) {
    if (isBlank(existing.location)) {
      merged.location = input.location;
      changed.push("location");
    } else {
      kept.push("location");
    }
  }
  if (input.salary !== undefined && input.salary !== (existing.salary ?? "")) {
    if (isBlank(existing.salary)) {
      merged.salary = input.salary;
      changed.push("salary");
    } else {
      kept.push("salary");
    }
  }

  merged.workMode =
    input.workMode ?? detectWorkMode(merged.location, merged.title, merged.tags);
  if (merged.workMode !== existing.workMode) changed.push("workMode");

  const scoreCleared =
    storedIsLead &&
    changed.includes("description") &&
    !isLeadDescription(merged.description);

  return { merged, changed, kept, scoreCleared };
}

/**
 * Add (or refresh) a job an external agent passes in over MCP. Deduped by
 * (source, externalId). On a dedupe hit the incoming data can only improve the
 * record: descriptions are overwritten just when the stored one is empty or a
 * placeholder, or the incoming one is longer; salary/location only fill blanks.
 * The app does not score — jobs are left/returned unscored for the agent.
 */
export async function addManualJob(input: ManualJobInput): Promise<AddJobResult> {
  const source = input.source ?? Source.MANUAL;
  const externalId = input.demoCode
    ? `${input.demoCode}::${input.url}`
    : input.url;
  const demoCode = input.demoCode ?? null;

  const existing = await prisma.job.findUnique({
    where: { source_externalId: { source, externalId } },
  });

  const duplicatesFor = async (fingerprint: string, selfId?: string) => {
    const rows = await prisma.job.findMany({
      where: { fingerprint, demoCode, ...(selfId ? { id: { not: selfId } } : {}) },
      select: { id: true, sourceUrl: true, location: true },
      take: 5,
    });
    return rows.map((r) => ({ id: r.id, url: r.sourceUrl, location: r.location }));
  };

  if (!existing) {
    const description = input.description ?? "";
    const workMode =
      input.workMode ?? detectWorkMode(input.location, input.title, input.tags ?? []);
    const job = await prisma.job.create({
      data: {
        source,
        externalId,
        sourceUrl: input.url,
        remote: workMode === WorkMode.REMOTE,
        postedAt: input.postedAt ? new Date(input.postedAt) : new Date(),
        sourceLabel: input.platform,
        title: input.title,
        company: input.company,
        description,
        location: input.location ?? null,
        salary: input.salary ?? null,
        tags: input.tags ?? [],
        demoCode,
        workMode,
        region: normalizeRegion(input.location),
        country: normalizeCountry(input.location),
        techs: extractTechs(input.title, input.tags ?? [], description),
        companyKey: companyKey(input.company),
        fingerprint: jobFingerprint(input.title, input.company),
      },
    });
    return {
      jobId: job.id,
      isNew: true,
      changed: [],
      kept: [],
      scoreCleared: false,
      duplicates: await duplicatesFor(job.fingerprint as string, job.id),
    };
  }

  // Dedupe hit: merge field by field, never replacing good content with worse.
  const { merged, changed, kept, scoreCleared } = mergeJobFields(existing, input);

  await prisma.job.update({
    where: { id: existing.id },
    data: {
      sourceLabel: input.platform,
      title: merged.title,
      company: merged.company,
      description: merged.description,
      location: merged.location,
      salary: merged.salary,
      tags: merged.tags,
      workMode: merged.workMode,
      lastSeenAt: new Date(),
      region: normalizeRegion(merged.location),
      country: normalizeCountry(merged.location),
      techs: extractTechs(merged.title, merged.tags, merged.description),
      companyKey: companyKey(merged.company),
      fingerprint: jobFingerprint(merged.title, merged.company),
    },
  });
  if (scoreCleared) {
    await prisma.jobScore.deleteMany({ where: { jobId: existing.id } });
  }

  return {
    jobId: existing.id,
    isNew: false,
    changed,
    kept,
    scoreCleared,
    duplicates: await duplicatesFor(jobFingerprint(merged.title, merged.company), existing.id),
  };
}

/** One-line human summary of an AddJobResult for tool responses. */
export function describeAddResult(r: AddJobResult): string {
  if (r.isNew) return "created";
  const parts: string[] = [];
  parts.push(r.changed.length ? `changed: ${r.changed.join(", ")}` : "no field changes");
  if (r.kept.length) parts.push(`kept existing (better): ${r.kept.join(", ")}`);
  if (r.scoreCleared) parts.push("score cleared — re-score it");
  parts.push("lastSeenAt bumped");
  return `updated (${parts.join(" · ")})`;
}
