import { Prisma, Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PAGE_SIZE = 50;

export type SortKey = "recent" | "title";
export type FreshKey = "24h" | "48h" | "7d";

export interface JobFilters {
  sources: Source[];
  keyword: string | null;
  fresh: FreshKey | null;
  remoteOnly: boolean;
  sort: SortKey;
  take: number;
}

const FRESH_HOURS: Record<FreshKey, number> = { "24h": 24, "48h": 48, "7d": 168 };

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Parse URL search params into validated job filters. Unknown values are ignored. */
export function parseJobFilters(params: RawParams): JobFilters {
  const validSources = new Set(Object.values(Source));
  const sources = (first(params.source) ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is Source => validSources.has(s as Source));

  const fresh = first(params.fresh);
  const sort = first(params.sort);
  const take = Number.parseInt(first(params.take) ?? "", 10);

  return {
    sources,
    keyword: first(params.keyword)?.trim() || null,
    fresh: fresh === "24h" || fresh === "48h" || fresh === "7d" ? fresh : null,
    remoteOnly: first(params.remote) === "true",
    sort: sort === "title" ? "title" : "recent",
    take: Number.isFinite(take) && take > 0 ? take : PAGE_SIZE,
  };
}

function buildWhere(filters: JobFilters): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {};

  if (filters.sources.length > 0) where.source = { in: filters.sources };
  if (filters.remoteOnly) where.remote = true;

  if (filters.fresh) {
    const since = new Date(Date.now() - FRESH_HOURS[filters.fresh] * 3600_000);
    where.postedAt = { gte: since };
  }

  if (filters.keyword) {
    const contains = { contains: filters.keyword, mode: "insensitive" as const };
    where.OR = [
      { title: contains },
      { company: contains },
      { tags: { has: filters.keyword.toLowerCase() } },
    ];
  }

  return where;
}

export interface JobListPage {
  jobs: Awaited<ReturnType<typeof prisma.job.findMany>>;
  hasMore: boolean;
  total: number;
}

/** Fetch a filtered, sorted page of jobs plus whether more exist (for "load more"). */
export async function getJobs(filters: JobFilters): Promise<JobListPage> {
  const where = buildWhere(filters);
  const orderBy: Prisma.JobOrderByWithRelationInput =
    filters.sort === "title" ? { title: "asc" } : { postedAt: "desc" };

  const [rows, total] = await Promise.all([
    // Fetch one extra to detect a next page without a second count per filter.
    prisma.job.findMany({ where, orderBy, take: filters.take + 1 }),
    prisma.job.count({ where }),
  ]);

  const hasMore = rows.length > filters.take;
  return { jobs: hasMore ? rows.slice(0, filters.take) : rows, hasMore, total };
}

export function getJobById(id: string) {
  return prisma.job.findUnique({ where: { id } });
}
