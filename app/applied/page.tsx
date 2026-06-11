import { getJobs, parseJobFilters } from "@/lib/jobs";
import { JobGrid } from "@/components/job-grid";

export const metadata = { title: "Applied · job-matchmaker" };

export default async function AppliedPage() {
  // minScore "0" disables the relevance floor — show everything you applied to.
  const filters = parseJobFilters({
    status: "APPLIED",
    sort: "recent",
    take: "200",
    minScore: "0",
  });
  const { jobs, total } = await getJobs(filters);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Applied</h1>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "application" : "applications"} tracked
        </p>
      </header>
      <JobGrid
        jobs={jobs}
        emptyMessage="No applications tracked yet. Mark a job “Applied” to track it here."
      />
    </main>
  );
}
