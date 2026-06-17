import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ActionStatus, Prisma } from "@prisma/client";
import {
  countJobs,
  getJobs,
  parseJobFilters,
  PAGE_SIZE,
  type JobFilters as Filters,
} from "@/lib/jobs";
import { getScope } from "@/lib/scope";
import { PageShell } from "@/components/page-shell";
import { JobFilters } from "@/components/job-filters";
import { JobCard } from "@/components/job-card";
import { CardsSkeleton } from "@/components/cards-skeleton";

type RawParams = Record<string, string | string[] | undefined>;

function buildLoadMoreHref(
  action: string,
  params: Record<string, string>,
  nextTake: number,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "take") continue;
    if (value) qs.set(key, value);
  }
  qs.set("take", String(nextTake));
  return `${action}?${qs.toString()}`;
}

/**
 * Shared filterable job list. The filter bar applies instantly (no submit) and
 * only the cards re-load: the heavy list query lives in a Suspense boundary
 * keyed by the active filters (excluding pagination), so changing a filter
 * swaps in a skeleton over the cards while the header and bar stay put.
 */
export async function JobListView({
  searchParams,
  title,
  subtitle,
  action,
  emptyMessage,
  defaults = {},
  demoDefaults,
  forceStatus,
  base,
  hideIngested = false,
}: {
  searchParams: RawParams;
  title: string;
  subtitle: (total: number) => string;
  action: string;
  emptyMessage: string;
  defaults?: RawParams;
  demoDefaults?: RawParams;
  forceStatus?: ActionStatus;
  base?: Prisma.JobWhereInput;
  hideIngested?: boolean;
}) {
  const scope = await getScope();
  if (!scope) redirect("/signin");

  const merged: RawParams = {
    ...defaults,
    ...(scope.kind === "demo" ? demoDefaults : undefined),
  };
  for (const [k, v] of Object.entries(searchParams)) {
    if (v !== undefined) merged[k] = v;
  }

  // Flatten to single-value strings for the client filter bar + load-more links.
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val != null) params[k] = val;
  }

  const filters = parseJobFilters(merged);
  if (forceStatus !== undefined) filters.status = forceStatus;

  const total = await countJobs(filters, scope.demoCode, base);

  // Suspense key = the filters that change the result set, minus pagination
  // (so "load more" appends without flashing the whole list to a skeleton).
  const { take: _take, ...keyParams } = params;
  const cardsKey = JSON.stringify(keyParams);

  return (
    <PageShell title={title} subtitle={subtitle(total)}>
      <div className="mb-6">
        <JobFilters
          filters={filters}
          params={params}
          action={action}
          hideStatus={forceStatus !== undefined}
          hideIngested={hideIngested}
          companyLabel={scope.kind === "demo" ? scope.space.label : undefined}
        />
      </div>

      <Suspense key={cardsKey} fallback={<CardsSkeleton />}>
        <JobCardsList
          filters={filters}
          demoCode={scope.demoCode}
          base={base}
          action={action}
          params={params}
          emptyMessage={emptyMessage}
        />
      </Suspense>
    </PageShell>
  );
}

async function JobCardsList({
  filters,
  demoCode,
  base,
  action,
  params,
  emptyMessage,
}: {
  filters: Filters;
  demoCode: string | null;
  base?: Prisma.JobWhereInput;
  action: string;
  params: Record<string, string>;
  emptyMessage: string;
}) {
  const { jobs, hasMore } = await getJobs(filters, demoCode, base);

  if (jobs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>

      {hasMore ? (
        <div className="mt-8 flex justify-center">
          <Link
            scroll={false}
            href={buildLoadMoreHref(action, params, filters.take + PAGE_SIZE)}
            className="h-9 rounded-lg border border-border bg-card px-5 text-sm font-semibold leading-9 hover:bg-accent"
          >
            Load more
          </Link>
        </div>
      ) : null}
    </>
  );
}
