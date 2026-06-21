import { JobListView } from "@/components/job-list-view";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata = { title: "Today · job-matchmaker" };

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
      title="Today"
      subtitle={(total) =>
        `${total} ${total === 1 ? "job" : "jobs"} scored recently`
      }
      emptyMessage="Nothing scored in the last day. Your agent scores new jobs continuously — widen the Evaluated filter to see more."
      // What's new to review = jobs scored in the last 24h (the Evaluated filter,
      // shown applied). Change it to widen. No score floor.
      defaults={{ minScore: "0", evaluated: "24h" }}
    />
  );
}
