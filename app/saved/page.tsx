import { JobListView } from "@/components/job-list-view";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata = { title: "Saved · job-matchmaker" };

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
      title="Saved"
      subtitle={(total) => `${total} saved ${total === 1 ? "job" : "jobs"}`}
      emptyMessage="Nothing saved yet. Hit “Save” on a job to keep it here."
      // Status locked to SAVED; default to show-all + newest so you can re-sort.
      forceStatus="SAVED"
      defaults={{ minScore: "0", sort: "recent" }}
    />
  );
}
