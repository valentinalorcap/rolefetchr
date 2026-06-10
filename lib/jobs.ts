import { ActionStatus, Prisma, Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PAGE_SIZE = 50;

export type SortKey = "recent" | "title" | "score";
export type FreshKey = "24h" | "48h" | "7d";

export type JobWithRelations = Prisma.JobGetPayload<{
  include: { score: true; action: true };
}>;

export interface JobFilters {
  sources: Source[];
  keyword: string | null;
  fresh: FreshKey | null;
  remoteOnly: boolean;
  minScore: number | null;
  status: ActionStatus | null;
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
  const minScore = Number.parseInt(first(params.minScore) ?? "", 10);

  const validStatuses = new Set(Object.values(ActionStatus));
  const rawStatus = first(params.status)?.toUpperCase();
  const status =
    rawStatus && validStatuses.has(rawStatus as ActionStatus)
      ? (rawStatus as ActionStatus)
      : null;

  return {
    sources,
    keyword: first(params.keyword)?.trim() || null,
    fresh: fresh === "24h" || fresh === "48h" || fresh === "7d" ? fresh : null,
    remoteOnly: first(params.remote) === "true",
    minScore: Number.isFinite(minScore) && minScore > 0 ? minScore : null,
    status,
    sort: sort === "title" || sort === "score" ? sort : "recent",
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

  // minScore implies "has a score at least this high" — unscored jobs drop out.
  if (filters.minScore !== null) {
    where.score = { is: { score: { gte: filters.minScore } } };
  }

  if (filters.status) {
    // Explicit status filter (e.g. the Saved / Applied pages).
    where.action = { is: { status: filters.status } };
  } else {
    // Default view hides jobs marked not-interested (keeps null-action jobs).
    where.NOT = { action: { is: { status: ActionStatus.NOT_INTERESTED } } };
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

function buildOrderBy(sort: SortKey): Prisma.JobOrderByWithRelationInput {
  switch (sort) {
    case "title":
      return { title: "asc" };
    case "score":
      // Highest score first; unscored jobs sort last (null relation).
      return { score: { score: "desc" } };
    default:
      return { postedAt: "desc" };
  }
}

export interface JobListPage {
  jobs: JobWithRelations[];
  hasMore: boolean;
  total: number;
}

/** Fetch a filtered, sorted page of jobs plus whether more exist (for "load more"). */
export async function getJobs(filters: JobFilters): Promise<JobListPage> {
  const where = buildWhere(filters);

  const [rows, total] = await Promise.all([
    // Fetch one extra to detect a next page without a second count per filter.
    prisma.job.findMany({
      where,
      orderBy: buildOrderBy(filters.sort),
      take: filters.take + 1,
      include: { score: true, action: true },
    }),
    prisma.job.count({ where }),
  ]);

  const hasMore = rows.length > filters.take;
  return { jobs: hasMore ? rows.slice(0, filters.take) : rows, hasMore, total };
}

export function getJobById(id: string) {
  return prisma.job.findUnique({
    where: { id },
    include: { score: true, action: true },
  });
}
