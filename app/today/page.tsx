import { getFreshJobs } from "@/lib/jobs";
import { JobGrid } from "@/components/job-grid";

export const metadata = { title: "Today · job-matchmaker" };

// New-to-review window. Daily ingest + scoring lag means 48h catches the
// freshest batch even if a day's run is delayed.
const WINDOW_HOURS = 48;

export default async function TodayPage() {
  const jobs = await getFreshJobs(WINDOW_HOURS);
  const topScore = jobs.find((j) => j.score)?.score?.score ?? null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">
          {jobs.length} new {jobs.length === 1 ? "job" : "jobs"} from the last 48
          hours, sorted by CV fit
          {topScore !== null ? ` · best match ${topScore}/100` : ""}.
        </p>
      </header>

      <JobGrid
        jobs={jobs}
        emptyMessage="Nothing new in the last 48 hours. The ingest runs daily — check back tomorrow, or browse all jobs."
      />
    </main>
  );
}
