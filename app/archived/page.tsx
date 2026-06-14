import { getJobs, parseJobFilters } from "@/lib/jobs";
import { PageShell } from "@/components/page-shell";
import { JobGrid } from "@/components/job-grid";

export const metadata = { title: "Archived · job-matchmaker" };

export default async function ArchivedPage() {
  // minScore "0" disables the relevance floor — show everything archived,
  // scored or not. Newest-archived isn't tracked, so sort by recency.
  const filters = parseJobFilters({
    status: "NOT_INTERESTED",
    sort: "recent",
    take: "200",
    minScore: "0",
  });
  const { jobs, total } = await getJobs(filters);

  return (
    <PageShell
      title="Archived"
      subtitle={`${total} archived ${total === 1 ? "job" : "jobs"}`}
    >
      <JobGrid
        jobs={jobs}
        emptyMessage="Nothing archived. Hit “Archive” on a job to move it here and out of the main views."
      />
    </PageShell>
  );
}
