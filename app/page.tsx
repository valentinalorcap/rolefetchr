import Link from "next/link";
import { getJobs, parseJobFilters, PAGE_SIZE } from "@/lib/jobs";
import { JobGrid } from "@/components/job-grid";
import { JobFilters } from "@/components/job-filters";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;

function buildLoadMoreHref(params: SearchParams, nextTake: number): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "take") continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v) qs.set(key, v);
  }
  qs.set("take", String(nextTake));
  return `/?${qs.toString()}`;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filters = parseJobFilters(params);
  const { jobs, hasMore, total } = await getJobs(filters);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Remote jobs</h1>
        <p className="text-sm text-muted-foreground">
          Aggregated from multiple sources and scored against your CV.
        </p>
      </header>

      <div className="mb-6">
        <JobFilters filters={filters} />
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        {total} {total === 1 ? "job" : "jobs"}
        {filters.keyword ? ` matching “${filters.keyword}”` : ""}
      </p>

      <JobGrid
        jobs={jobs}
        emptyMessage="No jobs match these filters. Try clearing them or widening the time range."
      />

      {hasMore ? (
        <div className="mt-8 flex justify-center">
          <Link
            href={buildLoadMoreHref(params, filters.take + PAGE_SIZE)}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Load more
          </Link>
        </div>
      ) : null}
    </main>
  );
}
