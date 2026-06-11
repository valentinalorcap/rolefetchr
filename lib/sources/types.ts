import type { Source } from "@prisma/client";

/**
 * A job normalized to the shape we persist (a `Job` minus DB-managed fields).
 * Every source adapter maps its raw API response into this.
 */
export interface NormalizedJob {
  source: Source;
  // For aggregator/manual sources, the real platform (e.g. "LinkedIn").
  sourceLabel?: string | null;
  externalId: string;
  title: string;
  company: string;
  description: string;
  location: string | null;
  remote: boolean;
  salary: string | null;
  tags: string[];
  sourceUrl: string;
  postedAt: Date;
}

/** A pluggable job source. Add one file per source and register it in index.ts. */
export interface JobSource {
  source: Source;
  fetchJobs(): Promise<NormalizedJob[]>;
}
