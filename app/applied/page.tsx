import { JobListView } from "@/components/job-list-view";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata = { title: "Applied · job-matchmaker" };

export default async function AppliedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <JobListView
      searchParams={params}
      action="/applied"
      title="Applied"
      subtitle={(total) =>
        `${total} ${total === 1 ? "application" : "applications"} tracked`
      }
      emptyMessage="No applications tracked yet. Mark a job “Applied” to track it here."
      forceStatus="APPLIED"
      defaults={{ minScore: "0", sort: "recent" }}
    />
  );
}
