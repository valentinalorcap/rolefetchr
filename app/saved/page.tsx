import { getJobs, parseJobFilters } from "@/lib/jobs";
import { PageShell } from "@/components/page-shell";
import { JobGrid } from "@/components/job-grid";

export const metadata = { title: "Saved · job-matchmaker" };

export default async function SavedPage() {
  // minScore "0" disables the relevance floor — show everything you saved,
  // scored or not. Sort by recency (not score) so unscored saved jobs still
  // appear and don't get jammed to the top by null-first ordering.
  const filters = parseJobFilters({
    status: "SAVED",
    sort: "recent",
    take: "200",
    minScore: "0",
  });
  const { jobs, total } = await getJobs(filters);

  return (
    <PageShell
      title="Saved"
      subtitle={`${total} saved ${total === 1 ? "job" : "jobs"}`}
    >
      <JobGrid
        jobs={jobs}
        emptyMessage="Nothing saved yet. Hit “Save” on a job to keep it here."
      />
    </PageShell>
  );
}
