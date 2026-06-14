import { JobListView } from "@/components/job-list-view";
import { BEST_MATCHES_BASE } from "@/lib/jobs";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata = { title: "Best matches · job-matchmaker" };

export default async function BestPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <JobListView
      searchParams={params}
      action="/best"
      title="Best matches"
      subtitle={(total) =>
        `${total} eligible ${total === 1 ? "match" : "matches"} · sorted by fit`
      }
      emptyMessage="No eligible matches at this score yet. Lower the min score, or check Jobs."
      // Eligible-only is locked; score floor + best-match sort are the defaults
      // (adjustable in the bar).
      base={BEST_MATCHES_BASE}
      defaults={{ minScore: "50", sort: "score" }}
    />
  );
}
