import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";

// JSearch (RapidAPI) reads Google for Jobs — which aggregates LinkedIn, Indeed,
// Glassdoor, etc. Remote-only queries matched to Valentina's stack. The real
// publisher (e.g. "LinkedIn") is kept in sourceLabel.
const QUERIES = [
  "remote typescript engineer",
  "remote angular developer",
  "remote fullstack typescript",
];

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

async function search(query: string, key: string): Promise<JSearchJob[]> {
  const url =
    `https://${HOST}/search?query=${encodeURIComponent(query)}` +
    `&page=1&num_pages=1&date_posted=week&remote_jobs_only=true`;
  const res = await fetch(url, {
    headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": HOST },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`JSearch responded ${res.status} for "${query}"`);
  const data = (await res.json()) as { data?: JSearchJob[] };
  return data.data ?? [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const jsearchSource: JobSource = {
  source: Source.JSEARCH,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const key = process.env.JSEARCH_API_KEY;
    if (!key) throw new Error("JSEARCH_API_KEY is not set");

    // The free tier rate-limits bursts — run queries sequentially with a gap,
    // and let one query's failure (e.g. 429) not sink the others.
    const collected: JSearchJob[] = [];
    for (const q of QUERIES) {
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
      byId.set(j.job_id, {
        source: Source.JSEARCH,
        sourceLabel: j.job_publisher ?? null,
        externalId: j.job_id,
        title: j.job_title.trim(),
        company: (j.employer_name || "Unknown").trim(),
        description: (j.job_description || "").trim(),
        location: j.job_is_remote ? "Remote" : j.job_location || null,
        remote: j.job_is_remote ?? true,
        salary: j.job_salary_string?.trim() || null,
        tags: [],
        sourceUrl: j.job_apply_link || `https://www.google.com/search?q=${encodeURIComponent(j.job_title)}`,
        postedAt: j.job_posted_at_datetime_utc
          ? new Date(j.job_posted_at_datetime_utc)
          : new Date(),
      });
    }

    return [...byId.values()];
  },
};
