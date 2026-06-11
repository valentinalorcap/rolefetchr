import { XMLParser } from "fast-xml-parser";
import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";

const USER_AGENT =
  "job-matchmaker/1.0 (+https://github.com/valentinalorcap/job-matchmaker)";

// Two category feeds matching Valentina's profile.
const FEEDS = [
  "https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss",
  "https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss",
];

interface WwrItem {
  title?: string;
  region?: string;
  category?: string;
  type?: string;
  description?: string;
  link?: string;
  guid?: string;
  pubDate?: string;
}

const parser = new XMLParser({ ignoreAttributes: true });

function toItems(xml: string): WwrItem[] {
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: WwrItem | WwrItem[] } };
  };
  const item = parsed.rss?.channel?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

function splitTitle(title: string): { company: string; role: string } {
  const idx = title.indexOf(":");
  if (idx === -1) return { company: "Unknown", role: title.trim() };
  return {
    company: title.slice(0, idx).trim() || "Unknown",
    role: title.slice(idx + 1).trim() || title.trim(),
  };
}

async function fetchFeed(url: string): Promise<NormalizedJob[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`WeWorkRemotely responded ${res.status} for ${url}`);

  return toItems(await res.text())
    .filter((it) => it.guid && it.title)
    .map((it): NormalizedJob => {
      const { company, role } = splitTitle(String(it.title));
      const tags = [it.category, it.type].filter(
        (t): t is string => typeof t === "string" && t.length > 0,
      );
      return {
        source: Source.WEWORKREMOTELY,
        externalId: String(it.guid),
        title: role,
        company,
        description: it.description?.trim() ?? "",
        location: it.region?.trim() || null,
        remote: true,
        salary: null,
        tags,
        sourceUrl: it.link ?? String(it.guid),
        postedAt: it.pubDate ? new Date(it.pubDate) : new Date(),
      };
    });
}

export const weWorkRemotelySource: JobSource = {
  source: Source.WEWORKREMOTELY,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const perFeed = await Promise.all(FEEDS.map(fetchFeed));
    // Dedup across the two feeds by externalId (a job can sit in both).
    const byId = new Map<string, NormalizedJob>();
    for (const job of perFeed.flat()) byId.set(job.externalId, job);
    return [...byId.values()];
  },
};
