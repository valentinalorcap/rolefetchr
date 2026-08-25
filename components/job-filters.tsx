"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobFilters as Filters } from "@/lib/jobs";
import type { Facets } from "@/lib/facets";
import {
  FilterChips,
  FiltersDrawer,
  type FilterBaseline,
} from "@/components/filters-drawer";

const control =
  "h-9 rounded-lg border px-3 text-sm font-medium text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

// A control at its neutral default looks plain; once it carries a real value it
// picks up a faint blue fill and a brighter border so it stands out at a glance.
const idle = "border-border bg-card/80 hover:border-ring/60";
const marked = "border-white/20 bg-primary/12 hover:border-ring/60";

// One-row toolbar: universal search + sort + the Filters drawer. Every actual
// filter (tag, score, location, dates, company, source, tech, eligibility)
// lives in the drawer; applied ones render as chips below.
export function JobFilters({
  filters,
  baseline,
  params,
  action = "/jobs",
  statusAction,
  hideIngested = false,
  companyLabel,
  facets,
}: {
  filters: Filters;
  // What the tab defaults to, so the drawer/chips only count real user filters.
  baseline: FilterBaseline;
  // Facet options + counts for the Filters drawer, scoped to the tenant.
  facets: Facets;
  // The current effective query (defaults + URL), so changing one control keeps
  // the rest. Filters apply instantly — there's no submit button.
  params: Record<string, string>;
  action?: string;
  // Where a tag change navigates to (defaults to `action`). The Saved/Applied/
  // Archived tabs point this at /jobs: picking other buckets means "browse".
  statusAction?: string;
  hideIngested?: boolean;
  // In a demo, the MANUAL source is the company's own board — label it so.
  companyLabel?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Local copies so a change shows INSTANTLY (the URL/server round-trip happens
  // in the background). Re-synced when the filters change.
  const [keyword, setKeyword] = useState(filters.keyword ?? "");
  const [sort, setSort] = useState<string>(filters.sort);
  useEffect(() => {
    setKeyword(filters.keyword ?? "");
    setSort(filters.sort);
  }, [filters.keyword, filters.sort]);

  function navigate(next: Record<string, string>) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    qs.delete("take"); // reset pagination when filters change
    const s = qs.toString();
    startTransition(() => router.push(s ? `${action}?${s}` : action));
  }

  function onSort(value: string) {
    setSort(value);
    const next = { ...params };
    if (value) next.sort = value;
    else delete next.sort;
    navigate(next);
  }

  function onKeyword(value: string) {
    setKeyword(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const next = { ...params };
      const trimmed = value.trim();
      if (trimmed) next.keyword = trimmed;
      else delete next.keyword;
      navigate(next);
    }, 350);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-stretch gap-2">
        <input
          type="search"
          value={keyword}
          onChange={(e) => onKeyword(e.target.value)}
          placeholder="Search anything — title, company, tech, country…"
          className={`${control} flex-1 basis-[260px] ${keyword ? marked : idle}`}
          aria-label="Search"
        />
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value)}
          className={`${control} shrink-0 ${idle}`}
          aria-label="Sort"
        >
          <option value="score">Best match</option>
          <option value="score_asc">Lowest match</option>
          <option value="ingested">Ingested: newest</option>
          <option value="ingested_asc">Ingested: oldest</option>
          <option value="posted">Published: newest</option>
          <option value="posted_asc">Published: oldest</option>
        </select>
        <FiltersDrawer
          facets={facets}
          filters={filters}
          baseline={baseline}
          params={params}
          action={action}
          statusAction={statusAction}
          hideIngested={hideIngested}
          companyLabel={companyLabel}
        />
      </div>
      <FilterChips
        facets={facets}
        filters={filters}
        baseline={baseline}
        params={params}
        action={action}
        companyLabel={companyLabel}
      />
    </div>
  );
}
