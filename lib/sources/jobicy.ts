import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";

// Jobicy — free public JSON API (https://jobi.cy/apidocs), no auth, full
// descriptions inline. `industry=dev` narrows to software engineering + QA.
// Two geo buckets: "anywhere" (open worldwide) and "europe" (region-restricted
// postings, e.g. "Europe" / "EMEA" or specific countries); the scoring agent
// judges eligibility per posting against the candidate's location.
const API_URL = "https://jobicy.com/api/v2/remote-jobs";
const GEOS = ["anywhere", "europe"];
const COUNT = 50; // API maximum per request
const USER_AGENT =
  "rolefetchr/1.0 (+https://github.com/valentinalorcap/rolefetchr)";

interface JobicyJob {
  id?: string | number;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  jobIndustry?: string[] | string;
  jobType?: string[] | string;
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: string | number;
  salaryMax?: string | number;
  salaryCurrency?: string;
  salaryPeriod?: string;
}

interface JobicyResponse {
  jobs?: JobicyJob[];
}

function asList(value: string[] | string | undefined): string[] {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string" && v.trim());
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function formatSalary(j: JobicyJob): string | null {
  const num = (v: string | number | undefined) => {
    const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const lo = num(j.salaryMin);
  const hi = num(j.salaryMax);
  if (!lo && !hi) return null;
  const cur = j.salaryCurrency?.trim() || "USD";
  const range =
    lo && hi ? `${lo.toLocaleString()} - ${hi.toLocaleString()}` : (lo ?? hi)!.toLocaleString();
  const period = j.salaryPeriod?.trim() ? `/${j.salaryPeriod.trim()}` : "";
  return `${range} ${cur}${period}`;
}

async function fetchGeo(geo: string): Promise<JobicyJob[]> {
  const url = `${API_URL}?count=${COUNT}&geo=${encodeURIComponent(geo)}&industry=dev`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Jobicy responded ${res.status} for geo=${geo}`);
  const data = (await res.json()) as JobicyResponse;
  return data.jobs ?? [];
}

export const jobicySource: JobSource = {
  source: Source.JOBICY,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const perGeo = await Promise.all(GEOS.map(fetchGeo));
    const byId = new Map<string, NormalizedJob>();

    for (const j of perGeo.flat()) {
      if (j.id == null || !j.jobTitle || !j.url) continue;
      const id = String(j.id);
      if (byId.has(id)) continue;
      // Level ("Senior") and type ("Contract") are real signals for scoring;
      // the industry bucket is not, but it keeps the tags searchable.
      const tags = [
        ...asList(j.jobType),
        ...(j.jobLevel && j.jobLevel !== "Any" ? [j.jobLevel] : []),
        ...asList(j.jobIndustry),
      ];
      byId.set(id, {
        source: Source.JOBICY,
        externalId: id,
        title: j.jobTitle.trim(),
        company: j.companyName?.trim() || "Unknown",
        description: j.jobDescription?.trim() || j.jobExcerpt?.trim() || "",
        location: j.jobGeo?.trim() || null,
        remote: true,
        salary: formatSalary(j),
        tags,
        sourceUrl: j.url,
        postedAt: j.pubDate ? new Date(j.pubDate) : new Date(),
      });
    }

    return [...byId.values()];
  },
};
