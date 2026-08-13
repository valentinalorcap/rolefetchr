import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";

const USER_AGENT =
  "rolefetchr/1.0 (+https://github.com/valentinalorcap/rolefetchr)";

// Himalayas has a free public JSON API. Search by keyword to stay relevant
// (the board carries every category); scoring narrows further.
const SEARCH_TERMS = ["typescript", "angular", "react", "node"];

interface HimalayasJob {
  title?: string;
  companyName?: string;
  description?: string;
  excerpt?: string;
  employmentType?: string;
  minSalary?: number | null;
  maxSalary?: number | null;
  currency?: string | null;
  seniority?: string[];
  locationRestrictions?: string[];
  categories?: string[];
  pubDate?: string | number;
  applicationLink?: string;
  guid?: string;
}

function formatSalary(j: HimalayasJob): string | null {
  const cur = j.currency ?? "$";
  if (j.minSalary && j.maxSalary)
    return `${cur}${j.minSalary.toLocaleString()} - ${cur}${j.maxSalary.toLocaleString()}`;
  const one = j.minSalary ?? j.maxSalary;
  return one ? `${cur}${one.toLocaleString()}` : null;
}

function parseDate(value: string | number | undefined): Date {
  if (value == null) return new Date();
  const d = new Date(typeof value === "number" && value < 1e12 ? value * 1000 : value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

async function search(term: string): Promise<HimalayasJob[]> {
  const res = await fetch(
    `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(term)}`,
    { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Himalayas responded ${res.status} for "${term}"`);
  const data = (await res.json()) as { jobs?: HimalayasJob[] };
  return data.jobs ?? [];
}

export const himalayasSource: JobSource = {
  source: Source.HIMALAYAS,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const perTerm = await Promise.all(SEARCH_TERMS.map(search));
    const byId = new Map<string, NormalizedJob>();

    for (const j of perTerm.flat()) {
      if (!j.guid || !j.title) continue;
      const tags = [
        ...(j.seniority ?? []),
        j.employmentType,
        ...(j.categories ?? []).slice(0, 4),
      ].filter((t): t is string => typeof t === "string" && t.length > 0);

      byId.set(j.guid, {
        source: Source.HIMALAYAS,
        externalId: j.guid,
        title: j.title.trim(),
        company: (j.companyName || "Unknown").trim(),
        description: (j.description || j.excerpt || "").trim(),
        location: j.locationRestrictions?.length
          ? j.locationRestrictions.join(", ")
          : "Worldwide",
        remote: true,
        salary: formatSalary(j),
        tags,
        sourceUrl: j.applicationLink || j.guid,
        postedAt: parseDate(j.pubDate),
      });
    }

    return [...byId.values()];
  },
};
