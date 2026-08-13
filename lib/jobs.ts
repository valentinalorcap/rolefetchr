import { ActionStatus, Prisma, Source } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PAGE_SIZE = 50;

// Default relevance floor: hide jobs that clearly don't fit (and unscored ones)
// unless the user explicitly asks to "show all". Keeps the views to real matches.
export const DEFAULT_MIN_SCORE = 30;

// Each date dimension (ingested / published) and the match/title dimensions
// have both directions.
export type SortKey =
  | "ingested" // newest ingested first (fetchedAt desc)
  | "ingested_asc" // oldest ingested first (fetchedAt asc)
  | "posted" // newest published first (postedAt desc)
  | "posted_asc" // oldest published first (postedAt asc)
  | "title" // A→Z
  | "title_desc" // Z→A
  | "score" // best match first
  | "score_asc"; // lowest match first
export type FreshKey = "24h" | "48h" | "7d";

const SORT_KEYS = new Set<SortKey>([
  "ingested",
  "ingested_asc",
  "posted",
  "posted_asc",
  "title",
  "title_desc",
  "score",
  "score_asc",
]);

const isScoreSort = (sort: SortKey) => sort === "score" || sort === "score_asc";

export type JobWithRelations = Prisma.JobGetPayload<{
  include: { score: true; action: true };
}>;

// The four tag buckets a job can be viewed by (canonical/display order —
// untagged first). "NONE" = no action row at all; "APPLIED" also covers the
// post-application stages (INTERVIEW/REJECTED).
export const STATUS_KEYS = ["NONE", "SAVED", "APPLIED", "NOT_INTERESTED"] as const;
export type StatusKey = (typeof STATUS_KEYS)[number];

export interface JobFilters {
  sources: Source[];
  keyword: string | null;
  fresh: FreshKey | null; // published within (postedAt)
  ingested: FreshKey | null; // ingested within (fetchedAt)
  evaluated: FreshKey | null; // scored within (JobScore.evaluatedAt)
  remoteOnly: boolean;
  minScore: number | null;
  eligible: boolean | null; // null = any; true/false filter on JobScore.eligible
  // Which status buckets to show (multi-select, OR-ed). All four = no filter.
  statuses: StatusKey[];
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

  // Absent, or nothing valid in the list → all buckets (no status filter).
  const rawStatus = first(params.status);
  const parsedStatuses = (rawStatus ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is StatusKey => (STATUS_KEYS as readonly string[]).includes(s));
  const statuses =
    parsedStatuses.length > 0
      ? STATUS_KEYS.filter((k) => parsedStatuses.includes(k))
      : [...STATUS_KEYS];

  const rawEligible = first(params.eligible);
  const eligible =
    rawEligible === "true" ? true : rawEligible === "false" ? false : null;

  return {
    sources,
    keyword: first(params.keyword)?.trim() || null,
    fresh: asFresh(first(params.fresh)),
    ingested: asFresh(first(params.ingested)),
    evaluated: asFresh(first(params.evaluated)),
    remoteOnly: first(params.remote) === "true",
    minScore,
    eligible,
    statuses,
    sort: sort && SORT_KEYS.has(sort as SortKey) ? (sort as SortKey) : "score",
    take: Number.isFinite(take) && take > 0 ? take : PAGE_SIZE,
  };
}

export function buildWhere(filters: JobFilters): Prisma.JobWhereInput {
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

  // Accumulate every score-relation condition into one `score.is` (each of these
  // implies the job has a score, so unscored jobs drop out for these filters).
  const scoreIs: Prisma.JobScoreWhereInput = {};
  if (filters.minScore !== null) scoreIs.score = { gte: filters.minScore };
  if (filters.eligible !== null) scoreIs.eligible = filters.eligible;
  if (filters.evaluated) {
    const since = new Date(Date.now() - FRESH_HOURS[filters.evaluated] * 3600_000);
    scoreIs.evaluatedAt = { gte: since };
  }
  const allStatuses = filters.statuses.length === STATUS_KEYS.length;

  if (Object.keys(scoreIs).length > 0) {
    where.score = { is: scoreIs };
  } else if (isScoreSort(filters.sort) && allStatuses) {
    // Match sorts rank scored jobs only; keep unscored out of those sorts. But
    // on a status-filtered view (e.g. Saved/Applied) we want every job you
    // flagged, scored or not — those must never hide an unscored saved job.
    where.score = { isNot: null };
  }

  if (!allStatuses) {
    // OR the selected buckets. APPLIED covers the whole post-application
    // pipeline; NONE matches jobs with no action row.
    const or: Prisma.JobWhereInput[] = [];
    const actionStatuses: ActionStatus[] = [];
    for (const key of filters.statuses) {
      if (key === "NONE") or.push({ action: { is: null } });
      else if (key === "APPLIED")
        actionStatuses.push(
          ActionStatus.APPLIED,
          ActionStatus.INTERVIEW,
          ActionStatus.REJECTED,
        );
      else actionStatuses.push(key);
    }
    if (actionStatuses.length > 0)
      or.push({ action: { is: { status: { in: actionStatuses } } } });
    // Keyword search owns the top-level OR, so this one goes through AND.
    where.AND = [{ OR: or }];
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
    case "ingested_asc":
      return { fetchedAt: "asc" };
    case "posted":
      return { postedAt: "desc" };
    case "posted_asc":
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
      // "ingested" — newest by ingestion date (when it landed in the app), not
      // postedAt, which is unreliable for EMAIL/MANUAL jobs (defaults to now()).
      return { fetchedAt: "desc" };
  }
}

export interface JobListPage {
  jobs: JobWithRelations[];
  hasMore: boolean;
  total: number;
}

/**
 * Fetch a filtered, sorted page of jobs plus whether more exist (for "load
 * more"). `demoCode` scopes the query to a tenant (null = the owner's real
 * jobs); it's always enforced. `base` is a tab-level constraint that the URL
 * filters can't remove (e.g. "eligible 50+" for Best matches) — it's AND-ed
 * with the user's filters.
 */
export async function getJobs(
  filters: JobFilters,
  demoCode: string | null,
  base?: Prisma.JobWhereInput,
): Promise<JobListPage> {
  const userWhere = buildWhere(filters);
  const parts: Prisma.JobWhereInput[] = [{ demoCode }, userWhere];
  if (base) parts.push(base);
  const where: Prisma.JobWhereInput = { AND: parts };

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

/** Cheap count for the header subtitle (no row fetch / includes), same scoping
 * and base as getJobs. Kept separate so the heavy list query can stream into a
 * Suspense boundary while the header renders immediately. */
export function countJobs(
  filters: JobFilters,
  demoCode: string | null,
  base?: Prisma.JobWhereInput,
): Promise<number> {
  const parts: Prisma.JobWhereInput[] = [{ demoCode }, buildWhere(filters)];
  if (base) parts.push(base);
  return prisma.job.count({ where: { AND: parts } });
}

/** One job by id, scoped: returns null if it doesn't belong to `demoCode`, so a
 * demo visitor can't open the owner's (or another space's) job by guessing an id. */
export function getJobById(id: string, demoCode: string | null) {
  return prisma.job.findFirst({
    where: { id, demoCode },
    include: { score: true, action: true },
  });
}

// Tab-level base constraints (AND-ed with the user's filters in getJobs). These
// can't be removed via the filter bar — they define what the tab *is*.

/** Best matches: only scored jobs the agent flagged eligible. The score floor
 * (default 50+) comes from the filter bar's minScore so it stays adjustable. */
export const BEST_MATCHES_BASE: Prisma.JobWhereInput = {
  score: { is: { eligible: true } },
};
