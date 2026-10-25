import { redirect } from "next/navigation";
import { JobListView } from "@/components/job-list-view";
import { FREELANCE_BASE } from "@/lib/jobs";
import { getScope } from "@/lib/scope";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata = { title: "Freelance & contract · rolefetchr" };

export default async function FreelancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  // The owner's track only — a demo space has no engagement data or tab.
  const scope = await getScope();
  if (scope?.kind === "demo") redirect("/jobs");

  return (
    <JobListView
      searchParams={params}
      action="/freelance"
      statusAction="/jobs"
      title="Freelance & contract"
      subtitle={(total) =>
        `${total} part-time, contract or freelance ${total === 1 ? "posting" : "postings"}`
      }
      emptyMessage="No postings declare part-time, contract or freelance work yet. Sources fill this as they ingest."
      // The engagement lock is the tab itself. Newest first with no score
      // floor: an unscored project is still worth seeing today.
      base={FREELANCE_BASE}
      defaults={{ minScore: "0", sort: "posted" }}
    />
  );
}
