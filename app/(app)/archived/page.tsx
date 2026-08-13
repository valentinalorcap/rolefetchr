import { JobListView } from "@/components/job-list-view";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata = { title: "Archived · rolefetchr" };

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
      statusAction="/jobs"
      title="Archived"
      subtitle={(total) => `${total} archived ${total === 1 ? "job" : "jobs"}`}
      emptyMessage="Nothing archived. Hit “Archive” on a job to move it here and out of the main views."
      defaults={{ status: "NOT_INTERESTED", minScore: "0" }}
    />
  );
}
