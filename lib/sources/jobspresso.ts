import { XMLParser } from "fast-xml-parser";
import { Source } from "@prisma/client";
import { decodeEntities } from "../description-fetch";
import type { JobSource, NormalizedJob } from "./types";

// Jobspresso — WordPress job feed (WP Job Manager), 10 items per page, newest
// first, paged with `paged=N`. Full posting HTML comes in content:encoded and
// the job_listing:* extension carries company / location / engagement type
// ("Full Time" / "Contract" / "Freelance") / category ("Engineer", ...).
// Pages go back years; a few pages per run is enough for a daily cron.
const FEED_URL = "https://jobspresso.co/?feed=job_feed";
const MAX_PAGES = 3;
const USER_AGENT =
  "rolefetchr/1.0 (+https://github.com/valentinalorcap/rolefetchr)";

interface JobspressoItem {
  title?: string;
  link?: string;
  guid?: string | number;
  pubDate?: string;
  description?: string;
  "content:encoded"?: string;
  "dc:creator"?: string;
  "job_listing:company"?: string;
  "job_listing:location"?: string;
  "job_listing:job_category"?: string; // engagement: Full Time / Contract / Freelance
  "job_listing:job_type"?: string; // category: "Engineer", "AI & Data, Engineer", ...
}

const parser = new XMLParser({ ignoreAttributes: true });

function toItems(xml: string): JobspressoItem[] {
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: JobspressoItem | JobspressoItem[] } };
  };
  const item = parsed.rss?.channel?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

// CDATA fields arrive with their HTML entities intact ("AI &amp; Data").
const text = (v: string | number | undefined) =>
  v == null ? "" : decodeEntities(String(v)).trim();

// Their categories are broad ("Engineer" covers all software roles); the
// global title gate in ingest narrows further.
function isEngineering(item: JobspressoItem): boolean {
  return /\bengineer/i.test(text(item["job_listing:job_type"]));
}

// guid = https://jobspresso.co/?post_type=job_listing&#038;p=163413 → the
// post id (WordPress escapes the ampersand as a numeric entity).
function externalIdFrom(item: JobspressoItem): string | null {
  const guid = text(item.guid);
  const m = /(?:[?&]|&#0*38;|&amp;)p=(\d+)/.exec(guid);
  if (m) return m[1];
  return guid || text(item.link) || null;
}

// dc:creator is "Company<br>⚲&nbsp;Location"; prefer the dedicated fields.
function companyOf(item: JobspressoItem): string {
  const company = text(item["job_listing:company"]);
  if (company) return company;
  const creator = text(item["dc:creator"]).split(/<br\s*\/?>/i)[0];
  return creator.trim() || "Unknown";
}

async function fetchPage(page: number): Promise<JobspressoItem[]> {
  const res = await fetch(`${FEED_URL}&paged=${page}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml" },
    cache: "no-store",
  });
  // WordPress answers 404 past the last page.
  if (res.status === 404 && page > 1) return [];
  if (!res.ok) throw new Error(`Jobspresso responded ${res.status} for page ${page}`);
  return toItems(await res.text());
}

export const jobspressoSource: JobSource = {
  source: Source.JOBSPRESSO,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const byId = new Map<string, NormalizedJob>();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const items = await fetchPage(page);
      if (items.length === 0) break;

      for (const it of items) {
        const id = externalIdFrom(it);
        if (!id || !it.title || !isEngineering(it) || byId.has(id)) continue;
        const engagement = text(it["job_listing:job_category"]);
        const category = text(it["job_listing:job_type"]);
        byId.set(id, {
          source: Source.JOBSPRESSO,
          externalId: id,
          title: text(it.title),
          company: companyOf(it),
          description: String(it["content:encoded"] ?? it.description ?? "").trim(),
          location: text(it["job_listing:location"]) || null,
          remote: true,
          salary: null,
          tags: [engagement, ...category.split(",").map((c) => c.trim())].filter(Boolean),
          sourceUrl: text(it.link) || text(it.guid),
          postedAt: it.pubDate ? new Date(it.pubDate) : new Date(),
        });
      }
    }

    return [...byId.values()];
  },
};
