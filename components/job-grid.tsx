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
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {jobs.map((job) => (
        <JobCard key={job.id} job={job} />
      ))}
    </div>
  );
}
