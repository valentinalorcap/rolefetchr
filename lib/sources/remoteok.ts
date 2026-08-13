import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";

const API_URL = "https://remoteok.com/api";
// RemoteOK rejects some default agents; identify ourselves per their API terms.
const USER_AGENT =
  "rolefetchr/1.0 (+https://github.com/valentinalorcap/rolefetchr)";

interface RemoteOkEntry {
  id?: string;
  slug?: string;
  epoch?: number;
  date?: string;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  url?: string;
  apply_url?: string;
  salary_min?: number;
  salary_max?: number;
  // Present only on the first (metadata) element.
  legal?: string;
}

function formatSalary(min?: number, max?: number): string | null {
  const lo = min && min > 0 ? min : undefined;
  const hi = max && max > 0 ? max : undefined;
  if (lo && hi) return `$${lo.toLocaleString()} - $${hi.toLocaleString()}`;
  const one = lo ?? hi;
  return one ? `$${one.toLocaleString()}` : null;
}

export const remoteOkSource: JobSource = {
  source: Source.REMOTEOK,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const res = await fetch(API_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`RemoteOK responded ${res.status}`);

    const data = (await res.json()) as RemoteOkEntry[];
    // The first array element is a legal/metadata notice, not a job.
    const entries = data.filter((e) => e && e.id && e.position);

    return entries.map((e): NormalizedJob => ({
      source: Source.REMOTEOK,
      externalId: String(e.id),
      title: e.position!.trim(),
      company: (e.company || "Unknown").trim(),
      description: e.description?.trim() ?? "",
      location: e.location?.trim() || null,
      remote: true,
      salary: formatSalary(e.salary_min, e.salary_max),
      tags: Array.isArray(e.tags) ? e.tags : [],
      sourceUrl:
        e.url ||
        e.apply_url ||
        `https://remoteok.com/remote-jobs/${e.slug ?? e.id}`,
      postedAt: e.epoch
        ? new Date(e.epoch * 1000)
        : e.date
          ? new Date(e.date)
          : new Date(),
    }));
  },
};
