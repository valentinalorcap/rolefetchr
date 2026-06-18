"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { JobFilters as Filters } from "@/lib/jobs";

const control =
  "h-9 rounded-lg border px-3 text-sm font-medium text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

// A control sitting at its neutral default (any / all sources / active / Score:
// any) looks plain; once it carries a real value it picks up a faint blue fill
// and a brighter border so applied filters stand out at a glance.
const idle = "border-border bg-card/80 hover:border-ring/60";
const marked = "border-white/20 bg-primary/12 hover:border-ring/60";

// Neutral = empty (any/all/active) or the "Score: any" zero floor.
const isApplied = (value: string) => value !== "" && value !== "0";

export function JobFilters({
  filters,
  params,
  action = "/jobs",
  hideStatus = false,
  hideIngested = false,
  companyLabel,
}: {
  filters: Filters;
  // The current effective query (defaults + URL), so changing one control keeps
  // the rest. Filters apply instantly — there's no submit button.
  params: Record<string, string>;
  action?: string;
  hideStatus?: boolean;
  hideIngested?: boolean;
  // In a demo, the MANUAL source is the company's own board — label it so.
  companyLabel?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Local copies of the controls so a selection shows INSTANTLY (the URL/server
  // round-trip happens in the background). Re-synced when the filters change.
  const derived: Record<
    | "keyword" | "sort" | "fresh" | "ingested" | "evaluated"
    | "minScore" | "eligible" | "source" | "status",
    string
  > = {
    keyword: filters.keyword ?? "",
    sort: filters.sort,
    fresh: filters.fresh ?? "",
    ingested: filters.ingested ?? "",
    evaluated: filters.evaluated ?? "",
    minScore: filters.minScore != null ? filters.minScore.toString() : "0",
    eligible: filters.eligible === true ? "true" : filters.eligible === false ? "false" : "",
    source: filters.sources[0] ?? "",
    status: filters.status ?? "",
  };
  const [vals, setVals] = useState(derived);
  useEffect(() => {
    setVals(derived);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    derived.keyword,
    derived.sort,
    derived.fresh,
    derived.ingested,
    derived.evaluated,
    derived.minScore,
    derived.eligible,
    derived.source,
    derived.status,
  ]);

  function navigate(next: Record<string, string>) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    qs.delete("take"); // reset pagination when filters change
    const s = qs.toString();
    startTransition(() => router.push(s ? `${action}?${s}` : action));
  }

  function set(name: string, value: string) {
    setVals((v) => ({ ...v, [name]: value }));
    const next = { ...params };
    if (value) next[name] = value;
    else delete next[name];
    navigate(next);
  }

  function onKeyword(value: string) {
    setVals((v) => ({ ...v, keyword: value }));
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      const next = { ...params };
      const trimmed = value.trim();
      if (trimmed) next.keyword = trimmed;
      else delete next.keyword;
      navigate(next);
    }, 350);
  }

  function clearAll() {
    setVals({ keyword: "", sort: "score", fresh: "", ingested: "", evaluated: "", minScore: "0", eligible: "", source: "", status: "" });
    startTransition(() => router.push(action));
  }

  // Per-control className: selects share the flex sizing; each lights up when its
  // value isn't the neutral default.
  const sel = (v: string) =>
    `${control} flex-1 basis-[140px] ${isApplied(v) ? marked : idle}`;
  const searchCls = `${control} flex-1 basis-[240px] ${isApplied(vals.keyword) ? marked : idle}`;

  return (
    <div className="space-y-2">
      {/* Row 1: free-text search + the three date filters. */}
      <div className="flex flex-wrap items-stretch gap-2">
        <input
          type="search"
          value={vals.keyword}
          onChange={(e) => onKeyword(e.target.value)}
          placeholder="Search title, company…"
          className={searchCls}
          aria-label="Search"
        />
        <select value={vals.fresh} onChange={(e) => set("fresh", e.target.value)} className={sel(vals.fresh)} aria-label="Published">
          <option value="">Published: any</option>
          <option value="24h">Published: 24h</option>
          <option value="48h">Published: 48h</option>
          <option value="7d">Published: 7 days</option>
        </select>
        {hideIngested ? null : (
          <select value={vals.ingested} onChange={(e) => set("ingested", e.target.value)} className={sel(vals.ingested)} aria-label="Ingested">
            <option value="">Ingested: any</option>
            <option value="24h">Ingested: 24h</option>
            <option value="48h">Ingested: 48h</option>
            <option value="7d">Ingested: 7 days</option>
          </select>
        )}
        <select value={vals.evaluated} onChange={(e) => set("evaluated", e.target.value)} className={sel(vals.evaluated)} aria-label="Evaluated">
          <option value="">Evaluated: any</option>
          <option value="24h">Evaluated: 24h</option>
          <option value="48h">Evaluated: 48h</option>
          <option value="7d">Evaluated: 7 days</option>
        </select>
      </div>
      {/* Row 2: sort, score, eligibility, source, status + clear. */}
      <div className="flex flex-wrap items-stretch gap-2">
        <select value={vals.sort} onChange={(e) => set("sort", e.target.value)} className={sel(vals.sort)} aria-label="Sort">
          <option value="score">Best match</option>
          <option value="score_asc">Lowest match</option>
          <option value="ingested">Ingested: newest</option>
          <option value="ingested_asc">Ingested: oldest</option>
          <option value="posted">Published: newest</option>
          <option value="posted_asc">Published: oldest</option>
          <option value="title">Title A–Z</option>
          <option value="title_desc">Title Z–A</option>
        </select>
        <select value={vals.minScore} onChange={(e) => set("minScore", e.target.value)} className={sel(vals.minScore)} aria-label="Min score">
          <option value="30">Score: 30+</option>
          <option value="50">Score: 50+</option>
          <option value="70">Score: 70+</option>
          <option value="0">Score: any</option>
        </select>
        <select value={vals.eligible} onChange={(e) => set("eligible", e.target.value)} className={sel(vals.eligible)} aria-label="Eligibility">
          <option value="">Eligibility: any</option>
          <option value="true">Eligible</option>
          <option value="false">Not eligible</option>
        </select>
        <select value={vals.source} onChange={(e) => set("source", e.target.value)} className={sel(vals.source)} aria-label="Source">
          <option value="">All sources</option>
          <option value="MANUAL">{companyLabel ?? "Manual"}</option>
          <option value="REMOTEOK">RemoteOK</option>
          <option value="REMOTIVE">Remotive</option>
          <option value="WEWORKREMOTELY">WeWorkRemotely</option>
          <option value="HACKERNEWS">Hacker News</option>
          <option value="HIMALAYAS">Himalayas</option>
          <option value="JSEARCH">JSearch</option>
          <option value="EMAIL">Email alerts</option>
        </select>
        {hideStatus ? null : (
          <select value={vals.status} onChange={(e) => set("status", e.target.value)} className={sel(vals.status)} aria-label="Status">
            <option value="">Active</option>
            <option value="SAVED">Saved</option>
            <option value="APPLIED">Applied</option>
            <option value="NOT_INTERESTED">Archived</option>
          </select>
        )}
        <button
          type="button"
          onClick={clearAll}
          className={`h-9 shrink-0 rounded-lg border px-4 text-sm font-medium text-foreground transition active:scale-[.97] ${marked}`}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
