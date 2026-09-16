import { XMLParser } from "fast-xml-parser";
import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";

// NoDesk — static-site RSS (no API). Each feed carries only its 10 most
// recent items and a short excerpt, so we read the all-jobs feed plus the
// engineering category feed, then open each job page to get the full posting
// (a <div class="grey-800"> block) and the metadata NoDesk puts on <main> as
// data-job-* attributes (employment type, region, tags). A page that can't
// be read keeps the excerpt and is stored as an unverified description.
const FEEDS = [
  "https://nodesk.co/remote-jobs/index.xml",
  "https://nodesk.co/remote-jobs/engineering/index.xml",
];
const PAGE_CONCURRENCY = 4;
const USER_AGENT =
  "rolefetchr/1.0 (+https://github.com/valentinalorcap/rolefetchr)";

interface NoDeskItem {
  title?: string;
  description?: string;
  pubDate?: string;
  guid?: string;
  link?: string;
}

interface NoDeskPage {
  description: string | null;
  employmentType: string | null;
  region: string | null;
  tags: string[];
}

const parser = new XMLParser({ ignoreAttributes: true });

function toItems(xml: string): NoDeskItem[] {
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: NoDeskItem | NoDeskItem[] } };
  };
  const item = parsed.rss?.channel?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

// Feed titles read "Role at Company"; split on the last " at ".
export function splitTitle(title: string): { role: string; company: string } {
  const idx = title.lastIndexOf(" at ");
  if (idx === -1) return { role: title.trim(), company: "Unknown" };
  return {
    role: title.slice(0, idx).trim() || title.trim(),
    company: title.slice(idx + 4).trim() || "Unknown",
  };
}

// NoDesk minifies its HTML, so attribute values may be quoted or bare.
function mainAttr(html: string, name: string): string | null {
  const m = new RegExp(`<main\\b[^>]*\\s${name}=(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(html);
  const value = m?.[1] ?? m?.[2] ?? m?.[3];
  return value?.trim() ? value.trim() : null;
}

/** Pure extraction over a NoDesk job page (exported for tests). */
export function parseJobPage(html: string): NoDeskPage {
  const body = /<div class=["']?grey-800["']?>([\s\S]*?)<\/div>\s*<div class=["']?mt9/i.exec(html);
  const description = body?.[1]?.trim() || null;
  const tags = (mainAttr(html, "data-job-tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t && !/^remote work$/i.test(t));
  return {
    description,
    employmentType: mainAttr(html, "data-job-employment-type"),
    region: mainAttr(html, "data-job-region"),
    tags,
  };
}

async function fetchText(url: string, accept: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: accept },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.text();
}

async function fetchFeed(url: string): Promise<NoDeskItem[]> {
  const xml = await fetchText(url, "application/rss+xml");
  if (xml == null) throw new Error(`NoDesk feed failed: ${url}`);
  return toItems(xml);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export const noDeskSource: JobSource = {
  source: Source.NODESK,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const feeds = await Promise.all(FEEDS.map(fetchFeed));
    const byId = new Map<string, NoDeskItem>();
    for (const it of feeds.flat()) {
      const id = it.link ?? it.guid;
      if (id && it.title && !byId.has(id)) byId.set(id, it);
    }

    return mapLimit([...byId.entries()], PAGE_CONCURRENCY, async ([id, it]) => {
      const { role, company } = splitTitle(String(it.title));
      let page: NoDeskPage | null = null;
      try {
        const html = await fetchText(id, "text/html");
        if (html) page = parseJobPage(html);
      } catch {
        page = null;
      }
      const fullDescription = page?.description ?? null;
      return {
        source: Source.NODESK,
        externalId: id,
        title: role,
        company,
        description: fullDescription ?? it.description?.trim() ?? "",
        location: page?.region ?? null,
        remote: true,
        salary: null,
        tags: [page?.employmentType, ...(page?.tags ?? [])].filter(
          (t): t is string => typeof t === "string" && t.length > 0,
        ),
        sourceUrl: id,
        postedAt: it.pubDate ? new Date(it.pubDate) : new Date(),
        descriptionUnverified: fullDescription == null,
      } satisfies NormalizedJob;
    });
  },
};
