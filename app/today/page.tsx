import { getTodayJobs } from "@/lib/jobs";
import { PageShell } from "@/components/page-shell";
import { JobGrid } from "@/components/job-grid";

export const metadata = { title: "Hoy · job-matchmaker" };

export default async function TodayPage() {
  const jobs = await getTodayJobs();

  return (
    <PageShell
      title="Hoy"
      subtitle={`${jobs.length} ${jobs.length === 1 ? "job" : "jobs"} ingested today`}
    >
      <JobGrid
        jobs={jobs}
        emptyMessage="Nothing ingested today yet. The daily ingest runs each morning — check back later."
      />
    </PageShell>
  );
}
