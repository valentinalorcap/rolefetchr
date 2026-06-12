import Link from "next/link";
import { getJobs, parseJobFilters, PAGE_SIZE } from "@/lib/jobs";
import { PageShell } from "@/components/page-shell";
import { JobFilters } from "@/components/job-filters";
import { JobCard } from "@/components/job-card";

type SearchParams = Record<string, string | string[] | undefined>;

function buildLoadMoreHref(params: SearchParams, nextTake: number): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "take") continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v) qs.set(key, v);
  }
  qs.set("take", String(nextTake));
  return `/jobs?${qs.toString()}`;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = parseJobFilters(params);
  const { jobs, hasMore, total } = await getJobs(filters);

  return (
    <PageShell
      title="Jobs"
      subtitle={`${total} ${total === 1 ? "job" : "jobs"}${
        filters.keyword ? ` matching “${filters.keyword}”` : ""
      }`}
    >
      <div className="mb-6">
        <JobFilters filters={filters} action="/jobs" />
      </div>

      {jobs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          No jobs match these filters. Try clearing them or widening the range.
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
            href={buildLoadMoreHref(params, filters.take + PAGE_SIZE)}
            className="h-9 rounded-lg border border-border bg-card px-5 text-sm font-semibold leading-9 hover:bg-accent"
          >
            Load more
          </Link>
        </div>
      ) : null}
    </PageShell>
  );
}
