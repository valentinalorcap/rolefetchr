import { ActionStatus, Prisma, Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PAGE_SIZE = 50;

// Default relevance floor: hide jobs that clearly don't fit (and unscored ones)
// unless the user explicitly asks to "show all". Keeps the views to real matches.
export const DEFAULT_MIN_SCORE = 30;

// Each sort dimension has both directions.
export type SortKey =
  | "recent" // newest published first
  | "oldest" // oldest published first
  | "title" // A→Z
  | "title_desc" // Z→A
  | "score" // best match first
  | "score_asc"; // lowest match first
export type FreshKey = "24h" | "48h" | "7d";

const SORT_KEYS = new Set<SortKey>([
  "recent",
  "oldest",
  "title",
  "title_desc",
  "score",
  "score_asc",
]);

const isScoreSort = (sort: SortKey) => sort === "score" || sort === "score_asc";

export type JobWithRelations = Prisma.JobGetPayload<{
  include: { score: true; action: true };
}>;

export interface JobFilters {
  sources: Source[];
  keyword: string | null;
  fresh: FreshKey | null; // published within (postedAt)
  ingested: FreshKey | null; // ingested within (fetchedAt)
  remoteOnly: boolean;
  minScore: number | null;
  status: ActionStatus | null;
  sort: SortKey;
  take: number;
}

const FRESH_KEYS = new Set<FreshKey>(["24h", "48h", "7d"]);
const asFresh = (v: string | undefined): FreshKey | null =>
  v && FRESH_KEYS.has(v as FreshKey) ? (v as FreshKey) : null;

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

  const sort = first(params.sort);
  const take = Number.parseInt(first(params.take) ?? "", 10);

  // Absent → default floor. Explicit "" or "0" → null (show everything).
  const rawMin = first(params.minScore);
  let minScore: number | null;
  if (rawMin === undefined) {
    minScore = DEFAULT_MIN_SCORE;
  } else {
    const n = Number.parseInt(rawMin, 10);
    minScore = Number.isFinite(n) && n > 0 ? n : null;
  }

  const validStatuses = new Set(Object.values(ActionStatus));
  const rawStatus = first(params.status)?.toUpperCase();
  const status =
    rawStatus && validStatuses.has(rawStatus as ActionStatus)
      ? (rawStatus as ActionStatus)
      : null;

  return {
    sources,
    keyword: first(params.keyword)?.trim() || null,
    fresh: asFresh(first(params.fresh)),
    ingested: asFresh(first(params.ingested)),
    remoteOnly: first(params.remote) === "true",
    minScore,
    status,
    sort: sort && SORT_KEYS.has(sort as SortKey) ? (sort as SortKey) : "recent",
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

  if (filters.ingested) {
    const since = new Date(Date.now() - FRESH_HOURS[filters.ingested] * 3600_000);
    where.fetchedAt = { gte: since };
  }

  // minScore implies "has a score at least this high" — unscored jobs drop out.
  if (filters.minScore !== null) {
    where.score = { is: { score: { gte: filters.minScore } } };
  } else if (isScoreSort(filters.sort) && !filters.status) {
    // Match sorts rank scored jobs only; keep unscored out of those sorts. But
    // on a status view (Saved/Applied) we want every job you flagged, scored or
    // not — those pages must never hide an unscored saved/applied job.
    where.score = { isNot: null };
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
    case "oldest":
      return { postedAt: "asc" };
    case "title":
      return { title: "asc" };
    case "title_desc":
      return { title: "desc" };
    case "score":
    case "score_asc":
      // Match sorts. Unscored jobs are excluded from these in buildWhere (you
      // can't rank by a match that hasn't been computed).
      return { score: { score: sort === "score" ? "desc" : "asc" } };
    default:
      return { postedAt: "desc" }; // "recent"
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

/**
 * The "Best matches" landing: eligible jobs scored 50+, best first, split into
 * Top (70+) and Worth a look (50-69). Hides not-interested and not-eligible.
 */
export async function getBestMatches(): Promise<{
  top: JobWithRelations[];
  worth: JobWithRelations[];
}> {
  const jobs = await prisma.job.findMany({
    where: {
      score: { is: { score: { gte: 50 }, eligible: true } },
      NOT: { action: { is: { status: ActionStatus.NOT_INTERESTED } } },
    },
    orderBy: { score: { score: "desc" } },
    take: 100,
    include: { score: true, action: true },
  });
  return {
    top: jobs.filter((j) => (j.score?.score ?? 0) >= 70),
    worth: jobs.filter((j) => (j.score?.score ?? 0) < 70),
  };
}

/**
 * The "Today" view: every job first ingested today (by fetchedAt), newest
 * first. No score floor — shows all of today's intake regardless of score (or
 * no score yet). Hides archived (not-interested) jobs.
 */
export async function getTodayJobs(): Promise<JobWithRelations[]> {
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  return prisma.job.findMany({
    where: {
      fetchedAt: { gte: startOfToday },
      NOT: { action: { is: { status: ActionStatus.NOT_INTERESTED } } },
    },
    orderBy: { fetchedAt: "desc" },
    include: { score: true, action: true },
  });
}
