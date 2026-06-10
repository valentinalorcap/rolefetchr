import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";

// Filter to software-dev at the source to cut noise; scoring narrows further later.
const API_URL = "https://remotive.com/api/remote-jobs?category=software-dev";

interface RemotiveJob {
  id: number;
  url: string;
  title: string;
  company_name: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date: string;
  candidate_required_location?: string;
  salary?: string;
  description: string;
}

interface RemotiveResponse {
  jobs?: RemotiveJob[];
}

export const remotiveSource: JobSource = {
  source: Source.REMOTIVE,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const res = await fetch(API_URL, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Remotive responded ${res.status}`);

    const data = (await res.json()) as RemotiveResponse;

    return (data.jobs ?? []).map((j): NormalizedJob => ({
      source: Source.REMOTIVE,
      externalId: String(j.id),
      title: j.title.trim(),
      company: (j.company_name || "Unknown").trim(),
      description: j.description?.trim() ?? "",
      location: j.candidate_required_location?.trim() || null,
      remote: true,
      salary: j.salary?.trim() || null,
      tags: Array.isArray(j.tags) ? j.tags : [],
      sourceUrl: j.url,
      // publication_date has no timezone; Remotive serves UTC, so pin it to UTC.
      postedAt: j.publication_date
        ? new Date(`${j.publication_date}Z`)
        : new Date(),
    }));
  },
};
