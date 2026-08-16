import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";

// Get on Board (LatAm-focused board) — free public JSON:API, no auth.
// We pull the `programming` category only and keep fully-remote roles
// (remote_local postings require residency in specific LatAm countries, which
// is a guaranteed eligibility blocker here); the global title relevance gate
// in ingest filters the rest.
const API_URL =
  "https://www.getonbrd.com/api/v0/categories/programming/jobs";
const USER_AGENT =
  "rolefetchr/1.0 (+https://github.com/valentinalorcap/rolefetchr)";
const MAX_PAGES = 5; // safety cap; the category is ~3 pages at per_page=100

interface GetOnBoardCompany {
  data?: { attributes?: { name?: string } };
}

interface GetOnBoardJob {
  id: string;
  attributes: {
    title: string;
    description?: string;
    functions?: string;
    functions_headline?: string;
    description_headline?: string;
    benefits?: string;
    benefits_headline?: string;
    remote?: boolean;
    remote_modality?: string;
    countries?: string[];
    min_salary?: number | null;
    max_salary?: number | null;
    published_at?: number; // epoch seconds
    company?: GetOnBoardCompany;
  };
  links?: { public_url?: string };
}

interface GetOnBoardResponse {
  data?: GetOnBoardJob[];
  meta?: { page?: number; total_pages?: number };
}

// "Remote" appears as a placeholder country on some fully-remote postings.
function realCountries(countries?: string[]): string[] {
  return (countries ?? []).filter(
    (c) => c && c.trim().toLowerCase() !== "remote",
  );
}

function buildLocation(a: GetOnBoardJob["attributes"]): string {
  const names = realCountries(a.countries).join(", ");
  return names ? `Remote (${names})` : "Remote";
}

// Get on Board publishes salaries as monthly USD ranges.
function buildSalary(min?: number | null, max?: number | null): string | null {
  const lo = min && min > 0 ? min : undefined;
  const hi = max && max > 0 ? max : undefined;
  if (lo && hi) return `$${lo.toLocaleString()} - $${hi.toLocaleString()} USD/month`;
  const one = lo ?? hi;
  return one ? `$${one.toLocaleString()} USD/month` : null;
}

// Stitch the posting's HTML sections back together with their own headlines.
function buildDescription(a: GetOnBoardJob["attributes"]): string {
  const sections: string[] = [];
  const add = (headline?: string, html?: string) => {
    if (!html?.trim()) return;
    sections.push(headline?.trim() ? `<h3>${headline.trim()}</h3>${html}` : html);
  };
  add(a.functions_headline, a.functions);
  add(a.description_headline, a.description);
  add(a.benefits_headline, a.benefits);
  return sections.join("");
}

export const getOnBoardSource: JobSource = {
  source: Source.GETONBOARD,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const jobs: NormalizedJob[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${API_URL}?per_page=100&page=${page}&expand=${encodeURIComponent('["company"]')}`;
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Get on Board responded ${res.status}`);

      const body = (await res.json()) as GetOnBoardResponse;
      const entries = body.data ?? [];

      for (const e of entries) {
        const a = e.attributes;
        if (!e.id || !a?.title || a.remote !== true) continue;
        if (a.remote_modality && a.remote_modality !== "fully_remote") continue;
        jobs.push({
          source: Source.GETONBOARD,
          externalId: e.id,
          title: a.title.trim(),
          company: a.company?.data?.attributes?.name?.trim() || "Unknown",
          description: buildDescription(a),
          location: buildLocation(a),
          remote: true,
          salary: buildSalary(a.min_salary, a.max_salary),
          tags: [],
          sourceUrl: e.links?.public_url || `https://www.getonbrd.com/jobs/${e.id}`,
          postedAt: a.published_at ? new Date(a.published_at * 1000) : new Date(),
        });
      }

      const totalPages = body.meta?.total_pages ?? page;
      if (page >= totalPages) break;
    }

    return jobs;
  },
};
