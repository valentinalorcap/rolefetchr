"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobFilters as Filters } from "@/lib/jobs";

const control =
  "h-9 rounded-lg border border-border bg-card/80 px-3 text-sm font-medium text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

export function JobFilters({
  filters,
  params,
  action = "/jobs",
  hideStatus = false,
  hideIngested = false,
}: {
  filters: Filters;
  // The current effective query (defaults + URL), so changing one control keeps
  // the rest. Filters apply instantly — there's no submit button.
  params: Record<string, string>;
  action?: string;
  hideStatus?: boolean;
  hideIngested?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keyword is locally controlled (no cursor jumps) and debounced; it re-syncs
  // when the URL keyword changes (e.g. Clear).
  const [keyword, setKeyword] = useState(filters.keyword ?? "");
  useEffect(() => {
    setKeyword(filters.keyword ?? "");
  }, [filters.keyword]);

  function go(next: Record<string, string>) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    qs.delete("take"); // reset pagination when filters change
    const s = qs.toString();
    startTransition(() => router.push(s ? `${action}?${s}` : action));
  }

  function set(name: string, value: string) {
    const next = { ...params };
    if (value) next[name] = value;
    else delete next[name];
    go(next);
  }

  function onKeyword(value: string) {
    setKeyword(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => set("keyword", value.trim()), 350);
  }

  const source = filters.sources[0] ?? "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        value={keyword}
        onChange={(e) => onKeyword(e.target.value)}
        placeholder="Search title, company…"
        className={`${control} w-56`}
        aria-label="Search"
      />
      <select value={filters.sort} onChange={(e) => set("sort", e.target.value)} className={control} aria-label="Sort">
        <option value="recent">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="score">Best match</option>
        <option value="score_asc">Lowest match</option>
        <option value="title">Title A–Z</option>
        <option value="title_desc">Title Z–A</option>
      </select>
      <select value={filters.fresh ?? ""} onChange={(e) => set("fresh", e.target.value)} className={control} aria-label="Published">
        <option value="">Published: any</option>
        <option value="24h">Published: 24h</option>
        <option value="48h">Published: 48h</option>
        <option value="7d">Published: 7 days</option>
      </select>
      {hideIngested ? null : (
        <select value={filters.ingested ?? ""} onChange={(e) => set("ingested", e.target.value)} className={control} aria-label="Ingested">
          <option value="">Ingested: any</option>
          <option value="24h">Ingested: 24h</option>
          <option value="48h">Ingested: 48h</option>
          <option value="7d">Ingested: 7 days</option>
        </select>
      )}
      <select
        value={filters.minScore != null ? filters.minScore.toString() : "0"}
        onChange={(e) => set("minScore", e.target.value)}
        className={control}
        aria-label="Min score"
      >
        <option value="30">Matches (30+)</option>
        <option value="50">Strong (50+)</option>
        <option value="70">Top (70+)</option>
        <option value="0">Show all</option>
      </select>
      <select value={source} onChange={(e) => set("source", e.target.value)} className={control} aria-label="Source">
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
        <select value={filters.status ?? ""} onChange={(e) => set("status", e.target.value)} className={control} aria-label="Status">
          <option value="">Active</option>
          <option value="SAVED">Saved</option>
          <option value="APPLIED">Applied</option>
          <option value="NOT_INTERESTED">Archived</option>
        </select>
      )}
      <button
        type="button"
        onClick={() => startTransition(() => router.push(action))}
        className="h-9 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Clear
      </button>
    </div>
  );
}
