import { XMLParser } from "fast-xml-parser";
import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";

// Landing.jobs — Atom feed (<feed><entry>, not RSS <item>), ~50 most recent
// postings with the full body in <content type="html"> and metadata in an
// lj:* namespace (city/country, job_type "Permanent" / "Contractor" /
// "Permanent / Contractor", category, salary, location_type). Most of the
// board is hybrid ("Partial remote") in one city, so only fully-remote
// postings ("Full remote" / "Global remote") are ingested.
const FEED_URL = "https://landing.jobs/feed";
const USER_AGENT =
  "rolefetchr/1.0 (+https://github.com/valentinalorcap/rolefetchr)";

const REMOTE_POLICIES = /^(full|global) remote$/i;

interface LandingEntry {
  id?: string;
  title?: string;
  published?: string;
  updated?: string;
  content?: string;
  author?: { name?: string } | string;
  "lj:city"?: string | boolean;
  "lj:country"?: string;
  "lj:salary"?: string;
  "lj:job_type"?: string;
  "lj:category"?: string;
  "lj:location_type"?: string;
  "lj:remote_policy"?: string;
}

// Attributes are ignored (the alternate <link href> carries UTM noise); the
// entry id is the canonical posting URL and doubles as the external id.
const parser = new XMLParser({ ignoreAttributes: true });

function toEntries(xml: string): LandingEntry[] {
  const parsed = parser.parse(xml) as {
    feed?: { entry?: LandingEntry | LandingEntry[] };
  };
  const entry = parsed.feed?.entry;
  if (!entry) return [];
  return Array.isArray(entry) ? entry : [entry];
}

const text = (v: string | number | boolean | undefined) =>
  typeof v === "string" ? v.trim() : "";

// The content wraps the posting in a logo <img> and an "offer-info" summary
// block (company, expiry, remote policy) that the metadata already covers.
export function extractBody(content: string): string {
  const role = /<div class="role-description">([\s\S]*)<\/div>\s*$/i.exec(content.trim());
  if (role) return role[1].trim();
  return content
    .replace(/<img[^>]*class="logo"[^>]*>/gi, "")
    .replace(/<div class="offer-info">[\s\S]*?<\/div>/i, "")
    .trim();
}

function locationOf(e: LandingEntry): string | null {
  // lj:city is literally "false" when unset.
  const city = text(e["lj:city"]);
  const country = text(e["lj:country"]);
  const parts = [city !== "false" ? city : "", country].filter(Boolean);
  // Drop "Portugal, Portugal"-style duplicates.
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length ? `${unique.join(", ")} (Remote)` : "Remote";
}

export const landingJobsSource: JobSource = {
  source: Source.LANDINGJOBS,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const res = await fetch(FEED_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Landing.jobs responded ${res.status}`);

    const jobs: NormalizedJob[] = [];
    for (const e of toEntries(await res.text())) {
      const id = text(e.id);
      const policy = text(e["lj:location_type"]) || text(e["lj:remote_policy"]);
      if (!id || !e.title || !REMOTE_POLICIES.test(policy)) continue;
      const author = typeof e.author === "string" ? e.author : e.author?.name;
      // "Permanent / Contractor" → both tags, so a contractor option is searchable.
      const engagement = text(e["lj:job_type"]).split("/").map((t) => t.trim());
      jobs.push({
        source: Source.LANDINGJOBS,
        externalId: id,
        title: text(e.title),
        company: text(author) || "Unknown",
        description: extractBody(String(e.content ?? "")),
        location: locationOf(e),
        remote: true,
        salary: text(e["lj:salary"]) || null,
        tags: [...engagement, text(e["lj:category"]), policy].filter(Boolean),
        sourceUrl: id,
        postedAt: e.published ? new Date(e.published) : new Date(),
      });
    }
    return jobs;
  },
};
