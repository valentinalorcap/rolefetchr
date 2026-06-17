import { JobListView } from "@/components/job-list-view";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata = { title: "Jobs · job-matchmaker" };

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const keyword = Array.isArray(params.keyword) ? params.keyword[0] : params.keyword;

  return (
    <JobListView
      searchParams={params}
      action="/jobs"
      title="Jobs"
      subtitle={(total) =>
        `${total} ${total === 1 ? "job" : "jobs"}${keyword ? ` matching “${keyword}”` : ""}`
      }
      emptyMessage="No jobs match these filters. Try clearing them or widening the range."
      // In a demo, show every loaded posting by default, best match first.
      demoDefaults={{ minScore: "0", sort: "score" }}
    />
  );
}
