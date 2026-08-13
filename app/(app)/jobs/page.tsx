import { JobListView } from "@/components/job-list-view";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata = { title: "Roles · rolefetchr" };

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
      title="Roles"
      subtitle={(total) =>
        `${total} ${total === 1 ? "role" : "roles"}${keyword ? ` matching “${keyword}”` : ""}`
      }
      emptyMessage="No roles match these filters. Try clearing them or widening the range."
      // In a demo, show every loaded posting by default (no relevance floor);
      // best-match sort is the global default.
      demoDefaults={{ minScore: "0" }}
    />
  );
}
