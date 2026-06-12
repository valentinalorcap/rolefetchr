import { getJobs, parseJobFilters } from "@/lib/jobs";
import { PageShell } from "@/components/page-shell";
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
    <PageShell
      title="Applied"
      subtitle={`${total} ${total === 1 ? "application" : "applications"} tracked`}
    >
      <JobGrid
        jobs={jobs}
        emptyMessage="No applications tracked yet. Mark a job “Applied” to track it here."
      />
    </PageShell>
  );
}
