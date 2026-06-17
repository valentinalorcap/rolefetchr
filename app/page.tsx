import { JobListView } from "@/components/job-list-view";
import { todayBase } from "@/lib/jobs";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata = { title: "Hoy · job-matchmaker" };

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <JobListView
      searchParams={params}
      action="/"
      title="Hoy"
      subtitle={(total) =>
        `${total} ${total === 1 ? "job" : "jobs"} ingested today`
      }
      emptyMessage="Nothing ingested today yet. The daily ingest runs each morning — check back later."
      // Ingested-today is the locked base; show all of today's intake (no score
      // floor), best-match first by default, with the full filter bar available.
      base={todayBase()}
      defaults={{ minScore: "0" }}
    />
  );
}
