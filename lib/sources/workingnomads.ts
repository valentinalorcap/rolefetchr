import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";

// Working Nomads — free public JSON endpoint (no auth, no filters honored;
// it returns the current listings across every category), full descriptions
// inline. We keep the "Development" category only.
const API_URL = "https://www.workingnomads.com/api/exposed_jobs/";
const CATEGORY = "development";
const USER_AGENT =
  "rolefetchr/1.0 (+https://github.com/valentinalorcap/rolefetchr)";

interface WorkingNomadsJob {
  url?: string;
  title?: string;
  description?: string;
  company_name?: string;
  category_name?: string;
  tags?: string; // comma-separated
  location?: string;
  pub_date?: string;
}

// Job URLs look like https://www.workingnomads.com/job/go/1867456/ — the
// numeric segment is the stable id.
function externalIdFrom(url: string): string {
  const m = /\/job\/(?:go\/)?(\d+)\/?/.exec(url);
  return m ? m[1] : url;
}

export const workingNomadsSource: JobSource = {
  source: Source.WORKINGNOMADS,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const res = await fetch(API_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Working Nomads responded ${res.status}`);

    const data = (await res.json()) as WorkingNomadsJob[];
    if (!Array.isArray(data)) return [];

    return data
      .filter(
        (j) =>
          j.url && j.title && j.category_name?.trim().toLowerCase() === CATEGORY,
      )
      .map((j): NormalizedJob => ({
        source: Source.WORKINGNOMADS,
        externalId: externalIdFrom(j.url!),
        title: j.title!.trim(),
        company: j.company_name?.trim() || "Unknown",
        description: j.description?.trim() ?? "",
        location: j.location?.trim() || null,
        remote: true,
        salary: null,
        tags: (j.tags ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        sourceUrl: j.url!,
        postedAt: j.pub_date ? new Date(j.pub_date) : new Date(),
      }));
  },
};
