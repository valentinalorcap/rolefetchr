import { JobCard } from "@/components/job-card";
import type { JobWithRelations } from "@/lib/jobs";

export function JobGrid({
  jobs,
  emptyMessage,
}: {
  jobs: JobWithRelations[];
  emptyMessage: string;
}) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}
