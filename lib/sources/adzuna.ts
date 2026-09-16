import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";
import { getAdzunaQueries, type AdzunaQuery } from "@/lib/source-queries";

// Adzuna — job aggregator with an official free API and per-country editions
// (the country code is part of the URL). It carries listings from the big
// local boards, so it is a way into markets whose own boards block
// automated reads. The API returns only a snippet of the description, so
// jobs are stored as unverified and the agent fetches the full posting
// before scoring. Queries (keywords, country, contract-only) live in
// ScoringConfig.sourceQueries; with none configured the adapter is idle.
const API_BASE = "https://api.adzuna.com/v1/api/jobs";
const RESULTS_PER_PAGE = 50;
const MAX_DAYS_OLD = 14;
const USER_AGENT =
  "rolefetchr/1.0 (+https://github.com/valentinalorcap/rolefetchr)";

interface AdzunaJob {
  id?: string | number;
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  company?: { display_name?: string };
  location?: { display_name?: string; area?: string[] };
  category?: { label?: string };
  salary_min?: number | null;
  salary_max?: number | null;
  salary_is_predicted?: string | number;
  contract_type?: string; // "contract" | "permanent"
  contract_time?: string; // "full_time" | "part_time"
}

interface AdzunaResponse {
  results?: AdzunaJob[];
}

export function buildUrl(q: AdzunaQuery, appId: string, appKey: string): string {
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    what: q.query,
    results_per_page: String(RESULTS_PER_PAGE),
    max_days_old: String(MAX_DAYS_OLD),
    sort_by: "date",
    "content-type": "application/json",
  });
  if (q.where) params.set("where", q.where);
  if (q.contractOnly) params.set("contract", "1");
  return `${API_BASE}/${q.country}/search/1?${params.toString()}`;
}

async function search(q: AdzunaQuery, appId: string, appKey: string): Promise<AdzunaJob[]> {
  const res = await fetch(buildUrl(q, appId, appKey), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Adzuna responded ${res.status} for "${q.query}" (${q.country})`);
  const data = (await res.json()) as AdzunaResponse;
  return data.results ?? [];
}

// Adzuna has no remote flag; the ad's own wording is the only signal, and the
// agent confirms it against the full posting.
const REMOTE_WORDING = /\bremote\b|work[- ]from[- ]home|\bwfh\b|\banywhere in\b/i;

function formatSalary(j: AdzunaJob): string | null {
  // Predicted salaries are Adzuna's estimate, not the ad's — leave them out.
  if (String(j.salary_is_predicted ?? "0") === "1") return null;
  const lo = j.salary_min && j.salary_min > 0 ? j.salary_min : undefined;
  const hi = j.salary_max && j.salary_max > 0 ? j.salary_max : undefined;
  if (lo && hi) return `${lo.toLocaleString()} - ${hi.toLocaleString()}`;
  const one = lo ?? hi;
  return one ? one.toLocaleString() : null;
}

function tagsOf(j: AdzunaJob): string[] {
  const tags: string[] = [];
  if (j.contract_type === "contract") tags.push("Contract");
  else if (j.contract_type === "permanent") tags.push("Permanent");
  if (j.contract_time === "full_time") tags.push("Full-time");
  else if (j.contract_time === "part_time") tags.push("Part-time");
  if (j.category?.label?.trim()) tags.push(j.category.label.trim());
  return tags;
}

export const adzunaSource: JobSource = {
  source: Source.ADZUNA,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const queries = await getAdzunaQueries();
    if (queries.length === 0) return [];

    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    if (!appId || !appKey) {
      console.warn("Adzuna skipped — ADZUNA_APP_ID / ADZUNA_APP_KEY not set");
      return [];
    }

    // One query's failure (rate limit, bad country) must not sink the others.
    const collected: AdzunaJob[] = [];
    for (const q of queries) {
      try {
        collected.push(...(await search(q, appId, appKey)));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Adzuna query skipped — ${message}`);
      }
    }

    const byId = new Map<string, NormalizedJob>();
    for (const j of collected) {
      if (j.id == null || !j.title || !j.redirect_url) continue;
      const id = String(j.id);
      if (byId.has(id)) continue;
      const title = j.title.trim();
      const description = (j.description ?? "").trim();
      const remote = REMOTE_WORDING.test(`${title} ${description}`);
      byId.set(id, {
        source: Source.ADZUNA,
        externalId: id,
        title,
        company: j.company?.display_name?.trim() || "Unknown",
        description,
        location: j.location?.display_name?.trim() || null,
        remote,
        salary: formatSalary(j),
        tags: tagsOf(j),
        sourceUrl: j.redirect_url,
        postedAt: j.created ? new Date(j.created) : new Date(),
        // The API only ships a snippet; the agent fetches the real posting.
        descriptionUnverified: true,
      });
    }

    return [...byId.values()];
  },
};
