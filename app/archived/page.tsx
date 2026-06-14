import { JobListView } from "@/components/job-list-view";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata = { title: "Archived · job-matchmaker" };

export default async function ArchivedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <JobListView
      searchParams={params}
      action="/archived"
      title="Archived"
      subtitle={(total) => `${total} archived ${total === 1 ? "job" : "jobs"}`}
      emptyMessage="Nothing archived. Hit “Archive” on a job to move it here and out of the main views."
      forceStatus="NOT_INTERESTED"
      defaults={{ minScore: "0", sort: "recent" }}
    />
  );
}
