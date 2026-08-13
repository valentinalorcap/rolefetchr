import { JobListView } from "@/components/job-list-view";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata = { title: "Saved · rolefetchr" };

export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  return (
    <JobListView
      searchParams={params}
      action="/saved"
      statusAction="/jobs"
      title="Saved"
      subtitle={(total) => `${total} saved ${total === 1 ? "job" : "jobs"}`}
      emptyMessage="Nothing saved yet. Hit “Save” on a job to keep it here."
      // Default to SAVED (shown in the status control) + show-all; re-sortable.
      defaults={{ status: "SAVED", minScore: "0" }}
    />
  );
}
