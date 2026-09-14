import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";
import { getJsearchQueries, type JSearchQuery } from "@/lib/source-queries";

// JSearch (RapidAPI) reads Google for Jobs — which aggregates LinkedIn, Indeed,
// Glassdoor and local boards. The real publisher (e.g. "LinkedIn") is kept in
// sourceLabel. The queries come from lib/source-queries (generic defaults, or
// the owner's configured list: keywords, country, employment type, remote or
// not). Non-remote queries are the only way an auto source ingests on-site or
// hybrid jobs, so `remote`/workMode follow the API's own flag.
const HOST = "jsearch.p.rapidapi.com";

interface JSearchJob {
  job_id?: string;
  job_title?: string;
  employer_name?: string;
  job_publisher?: string;
  job_employment_type?: string;
  job_apply_link?: string;
  job_description?: string;
  job_is_remote?: boolean;
  job_posted_at_datetime_utc?: string;
  job_location?: string;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_string?: string | null;
}

function buildUrl(q: JSearchQuery): string {
  const params = new URLSearchParams({
    query: q.query,
    page: "1",
    num_pages: "1",
    date_posted: "week",
  });
  if (q.remoteOnly) params.set("remote_jobs_only", "true");
  if (q.country) params.set("country", q.country);
  if (q.employmentTypes) params.set("employment_types", q.employmentTypes);
  return `https://${HOST}/search?${params.toString()}`;
}

async function search(q: JSearchQuery, key: string): Promise<JSearchJob[]> {
  const res = await fetch(buildUrl(q), {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`JSearch responded ${res.status} for "${q.query}"`);
  const data = (await res.json()) as { data?: JSearchJob[] };
  return data.data ?? [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// "Contractor" / "Full-time" as a tag so the agent sees the employment type
// the board declared (a configured query may target contract roles).
function employmentTag(type?: string): string | null {
  if (!type) return null;
  const t = type.trim().toLowerCase().replace(/[_-]/g, "");
  if (t === "contractor" || t === "contract") return "Contract";
  if (t === "fulltime") return "Full-time";
  if (t === "parttime") return "Part-time";
  if (t === "intern" || t === "internship") return "Internship";
  return type.trim();
}

export const jsearchSource: JobSource = {
  source: Source.JSEARCH,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const key = process.env.JSEARCH_API_KEY;
    if (!key) throw new Error("JSEARCH_API_KEY is not set");

    // The free tier rate-limits bursts — run queries sequentially with a gap,
    // and let one query's failure (e.g. 429) not sink the others.
    const queries = await getJsearchQueries();
    const collected: JSearchJob[] = [];
    for (const q of queries) {
      try {
        collected.push(...(await search(q, key)));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`JSearch query skipped — ${message}`);
      }
      await sleep(1200);
    }

    const byId = new Map<string, NormalizedJob>();
    for (const j of collected) {
      if (!j.job_id || !j.job_title) continue;
      const remote = j.job_is_remote ?? true;
      const tag = employmentTag(j.job_employment_type);
      byId.set(j.job_id, {
        source: Source.JSEARCH,
        sourceLabel: j.job_publisher ?? null,
        externalId: j.job_id,
        title: j.job_title.trim(),
        company: (j.employer_name || "Unknown").trim(),
        description: (j.job_description || "").trim(),
        location: remote ? "Remote" : j.job_location || null,
        remote,
        salary: j.job_salary_string?.trim() || null,
        tags: tag ? [tag] : [],
        sourceUrl: j.job_apply_link || `https://www.google.com/search?q=${encodeURIComponent(j.job_title)}`,
        postedAt: j.job_posted_at_datetime_utc
          ? new Date(j.job_posted_at_datetime_utc)
          : new Date(),
      });
    }

    return [...byId.values()];
  },
};
