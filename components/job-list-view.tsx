import Link from "next/link";
import { redirect } from "next/navigation";
import type { ActionStatus, Prisma } from "@prisma/client";
import { getJobs, parseJobFilters, PAGE_SIZE } from "@/lib/jobs";
import { getScope } from "@/lib/scope";
import { PageShell } from "@/components/page-shell";
import { JobFilters } from "@/components/job-filters";
import { JobCard } from "@/components/job-card";

type RawParams = Record<string, string | string[] | undefined>;

function buildLoadMoreHref(
  action: string,
  params: RawParams,
  nextTake: number,
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "take") continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v) qs.set(key, v);
  }
  qs.set("take", String(nextTake));
  return `${action}?${qs.toString()}`;
}

/**
 * Shared filterable job list used by every tab. `defaults` pre-fill the filter
 * controls when absent from the URL; `forceStatus` locks the status to the tab
 * (hiding its control); `base` is a tab constraint AND-ed with the user filters
 * that the bar can't remove (e.g. eligible-only for Best, ingested-today for Hoy).
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
  // Extra defaults applied only in a demo scope (e.g. no relevance floor on Jobs
  // so a curated demo shows every loaded posting).
  demoDefaults?: RawParams;
  forceStatus?: ActionStatus;
  base?: Prisma.JobWhereInput;
  hideIngested?: boolean;
}) {
  const scope = await getScope();
  if (!scope) redirect("/signin");

  // URL params win over the tab's defaults; demo-only defaults overlay the base
  // defaults when in a demo scope.
  const merged: RawParams = {
    ...defaults,
    ...(scope.kind === "demo" ? demoDefaults : undefined),
  };
  for (const [k, v] of Object.entries(searchParams)) {
    if (v !== undefined) merged[k] = v;
  }

  const filters = parseJobFilters(merged);
  if (forceStatus !== undefined) filters.status = forceStatus;

  const { jobs, hasMore, total } = await getJobs(filters, scope.demoCode, base);

  return (
    <PageShell title={title} subtitle={subtitle(total)}>
      <div className="mb-6">
        <JobFilters
          filters={filters}
          action={action}
          hideStatus={forceStatus !== undefined}
          hideIngested={hideIngested}
        />
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="mt-8 flex justify-center">
          <Link
            scroll={false}
            href={buildLoadMoreHref(action, merged, filters.take + PAGE_SIZE)}
            className="h-9 rounded-lg border border-border bg-card px-5 text-sm font-semibold leading-9 hover:bg-accent"
          >
            Load more
          </Link>
        </div>
      ) : null}
    </PageShell>
  );
}
