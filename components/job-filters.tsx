import Link from "next/link";
import type { JobFilters as Filters } from "@/lib/jobs";

const control =
  "h-9 rounded-lg border border-border bg-card/80 px-3 text-sm font-medium text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

export function JobFilters({
  filters,
  action = "/jobs",
  hideStatus = false,
  hideIngested = false,
}: {
  filters: Filters;
  action?: string;
  // Tabs that fix a dimension hide its control (and enforce it server-side):
  // e.g. Saved/Applied/Archived hide Status; Hoy hides Ingested.
  hideStatus?: boolean;
  hideIngested?: boolean;
}) {
  const source = filters.sources[0] ?? "";

  return (
    // key forces a remount when filters change so the uncontrolled inputs reset
    // (otherwise "Clear" navigates but the selects keep their old values).
    <form
      key={`${filters.keyword}|${source}|${filters.fresh}|${filters.ingested}|${filters.minScore}|${filters.status}|${filters.sort}`}
      method="get"
      action={action}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        type="search"
        name="keyword"
        placeholder="Search title, company…"
        defaultValue={filters.keyword ?? ""}
        className={`${control} w-56`}
      />
      <select name="sort" defaultValue={filters.sort} className={control} aria-label="Sort">
        <option value="recent">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="score">Best match</option>
        <option value="score_asc">Lowest match</option>
        <option value="title">Title A–Z</option>
        <option value="title_desc">Title Z–A</option>
      </select>
      <select name="fresh" defaultValue={filters.fresh ?? ""} className={control} aria-label="Published">
        <option value="">Published: any</option>
        <option value="24h">Published: 24h</option>
        <option value="48h">Published: 48h</option>
        <option value="7d">Published: 7 days</option>
      </select>
      {hideIngested ? null : (
        <select name="ingested" defaultValue={filters.ingested ?? ""} className={control} aria-label="Ingested">
          <option value="">Ingested: any</option>
          <option value="24h">Ingested: 24h</option>
          <option value="48h">Ingested: 48h</option>
          <option value="7d">Ingested: 7 days</option>
        </select>
      )}
      <select
        name="minScore"
        defaultValue={filters.minScore?.toString() ?? ""}
        className={control}
        aria-label="Min score"
      >
        <option value="30">Matches (30+)</option>
        <option value="50">Strong (50+)</option>
        <option value="70">Top (70+)</option>
        <option value="">Show all</option>
      </select>
      <select name="source" defaultValue={source} className={control} aria-label="Source">
        <option value="">All sources</option>
        <option value="REMOTEOK">RemoteOK</option>
        <option value="REMOTIVE">Remotive</option>
        <option value="WEWORKREMOTELY">WeWorkRemotely</option>
        <option value="HACKERNEWS">Hacker News</option>
        <option value="HIMALAYAS">Himalayas</option>
        <option value="JSEARCH">JSearch</option>
        <option value="EMAIL">Email alerts</option>
        <option value="MANUAL">Manual</option>
      </select>
      {hideStatus ? null : (
        <select name="status" defaultValue={filters.status ?? ""} className={control} aria-label="Status">
          <option value="">Active</option>
          <option value="SAVED">Saved</option>
          <option value="APPLIED">Applied</option>
          <option value="NOT_INTERESTED">Archived</option>
        </select>
      )}
      <button
        type="submit"
        className="h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Filter
      </button>
      <Link
        href={action}
        className="h-9 rounded-lg px-3 text-sm font-medium leading-9 text-muted-foreground hover:text-foreground"
      >
        Clear
      </Link>
    </form>
  );
}
