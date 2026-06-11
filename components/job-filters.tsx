import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JobFilters } from "@/lib/jobs";

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * URL-driven filter bar. A plain GET form — no client JS — so filters live
 * entirely in the query string and the page stays a server component.
 * Submitting drops the `take` param, resetting pagination to the first page.
 */
export function JobFilters({ filters }: { filters: JobFilters }) {
  const source = filters.sources[0] ?? "";

  return (
    <form
      method="get"
      action="/"
      className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Keyword
        <Input
          type="search"
          name="keyword"
          placeholder="typescript, react…"
          defaultValue={filters.keyword ?? ""}
          className="h-9 w-48"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Source
        <select name="source" defaultValue={source} className={selectClass}>
          <option value="">All sources</option>
          <option value="REMOTEOK">RemoteOK</option>
          <option value="REMOTIVE">Remotive</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Posted
        <select name="fresh" defaultValue={filters.fresh ?? ""} className={selectClass}>
          <option value="">Any time</option>
          <option value="24h">Last 24h</option>
          <option value="48h">Last 48h</option>
          <option value="7d">Last 7 days</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Min score
        <select
          name="minScore"
          defaultValue={filters.minScore?.toString() ?? ""}
          className={selectClass}
        >
          <option value="30">Matches (30+)</option>
          <option value="50">Strong (50+)</option>
          <option value="70">Top (70+)</option>
          <option value="">Show all</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Status
        <select
          name="status"
          defaultValue={filters.status ?? ""}
          className={selectClass}
        >
          <option value="">Active</option>
          <option value="SAVED">Saved</option>
          <option value="APPLIED">Applied</option>
          <option value="NOT_INTERESTED">Not interested</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Sort
        <select name="sort" defaultValue={filters.sort} className={selectClass}>
          <option value="recent">Newest</option>
          <option value="score">Best match</option>
          <option value="title">Title A–Z</option>
        </select>
      </label>

      <div className="flex gap-2">
        <Button type="submit">Filter</Button>
        <Link href="/" className={cn(buttonVariants({ variant: "ghost" }))}>
          Clear
        </Link>
      </div>
    </form>
  );
}
