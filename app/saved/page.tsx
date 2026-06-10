import { getJobs, parseJobFilters } from "@/lib/jobs";
import { JobGrid } from "@/components/job-grid";

export const metadata = { title: "Saved · job-matchmaker" };

export default async function SavedPage() {
  const filters = parseJobFilters({ status: "SAVED", sort: "score", take: "200" });
  const { jobs, total } = await getJobs(filters);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Saved</h1>
        <p className="text-sm text-muted-foreground">
          {total} saved {total === 1 ? "job" : "jobs"}
        </p>
      </header>
      <JobGrid
        jobs={jobs}
        emptyMessage="Nothing saved yet. Hit “Save” on a job to keep it here."
      />
    </main>
  );
}
