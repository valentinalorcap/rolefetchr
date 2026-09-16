import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";
import { parseWpJobFeed, wpBody, wpList, wpPostId, wpText, type WpJobItem } from "./wp-job-feed";

// Jobspresso — WP Job Manager feed, 10 items per page, newest first, paged
// with `paged=N`. job_listing:job_category is the engagement ("Full Time" /
// "Contract" / "Freelance") and job_listing:job_type the category
// ("Engineer", "AI & Data, Engineer", ...) — the reverse of most boards.
// Pages go back years; a few pages per run is enough for a daily cron.
const FEED_URL = "https://jobspresso.co/?feed=job_feed";
const MAX_PAGES = 3;
const USER_AGENT =
  "rolefetchr/1.0 (+https://github.com/valentinalorcap/rolefetchr)";

// Their categories are broad ("Engineer" covers all software roles); the
// global title gate in ingest narrows further.
function isEngineering(item: WpJobItem): boolean {
  return /\bengineer/i.test(wpText(item["job_listing:job_type"]));
}

// dc:creator is "Company<br>⚲&nbsp;Location"; prefer the dedicated field.
function companyOf(item: WpJobItem): string {
  const company = wpText(item["job_listing:company"]);
  if (company) return company;
  const creator = wpText(item["dc:creator"]).split(/<br\s*\/?>/i)[0];
  return creator.trim() || "Unknown";
}

async function fetchPage(page: number): Promise<WpJobItem[]> {
  const res = await fetch(`${FEED_URL}&paged=${page}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml" },
    cache: "no-store",
  });
  // WordPress answers 404 past the last page.
  if (res.status === 404 && page > 1) return [];
  if (!res.ok) throw new Error(`Jobspresso responded ${res.status} for page ${page}`);
  return parseWpJobFeed(await res.text());
}

export const jobspressoSource: JobSource = {
  source: Source.JOBSPRESSO,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const byId = new Map<string, NormalizedJob>();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const items = await fetchPage(page);
      if (items.length === 0) break;

      for (const it of items) {
        const id = wpPostId(it);
        if (!id || !it.title || !isEngineering(it) || byId.has(id)) continue;
        byId.set(id, {
          source: Source.JOBSPRESSO,
          externalId: id,
          title: wpText(it.title),
          company: companyOf(it),
          description: wpBody(it),
          location: wpText(it["job_listing:location"]) || null,
          remote: true,
          salary: null,
          tags: [wpText(it["job_listing:job_category"]), ...wpList(it["job_listing:job_type"])].filter(Boolean),
          sourceUrl: wpText(it.link) || wpText(it.guid),
          postedAt: it.pubDate ? new Date(it.pubDate) : new Date(),
        });
      }
    }

    return [...byId.values()];
  },
};
