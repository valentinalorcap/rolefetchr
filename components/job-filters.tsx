"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STATUS_KEYS, type JobFilters as Filters, type StatusKey } from "@/lib/jobs";

const STATUS_LABELS: Record<StatusKey, string> = {
  NONE: "Untagged",
  SAVED: "Saved",
  APPLIED: "Applied",
  NOT_INTERESTED: "Archived",
};

const control =
  "h-9 rounded-lg border px-3 text-sm font-medium text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";

// A control sitting at its neutral default (any / all sources / active / Score:
// any) looks plain; once it carries a real value it picks up a faint blue fill
// and a brighter border so applied filters stand out at a glance.
const idle = "border-border bg-card/80 hover:border-ring/60";
const marked = "border-white/20 bg-primary/12 hover:border-ring/60";

// Neutral = empty (any/all sources/all statuses) or the "Score: any" zero floor.
const isApplied = (value: string) => value !== "" && value !== "0";

// vals.status is "" (all buckets) or a comma-joined subset in canonical order.
const selectedStatuses = (value: string): StatusKey[] =>
  value ? (value.split(",") as StatusKey[]) : [...STATUS_KEYS];

function statusSummary(value: string): string {
  const selected = selectedStatuses(value);
  if (selected.length === STATUS_KEYS.length) return "Tag: all";
  if (selected.length === 1) return `Tag: ${STATUS_LABELS[selected[0]]}`;
  return `Tag: ${selected.length} selected`;
}

export function JobFilters({
  filters,
  params,
  action = "/jobs",
  statusAction,
  hideIngested = false,
  companyLabel,
}: {
  filters: Filters;
  // The current effective query (defaults + URL), so changing one control keeps
  // the rest. Filters apply instantly — there's no submit button.
  params: Record<string, string>;
  action?: string;
  // Where changing the STATUS filter navigates to (defaults to `action`). The
  // Saved/Applied/Archived tabs point this at /jobs: picking other statuses
  // there means "browse", which those single-status tabs can't show.
  statusAction?: string;
  hideIngested?: boolean;
  // In a demo, the MANUAL source is the company's own board — label it so.
  companyLabel?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Status popover open/close (closes on outside click or Escape).
  const [statusOpen, setStatusOpen] = useState(false);
  const statusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!statusOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!statusRef.current?.contains(e.target as Node)) setStatusOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStatusOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [statusOpen]);

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
    // Canonical order; all four buckets = "" (the neutral, no-param state).
    status: filters.statuses.length === STATUS_KEYS.length ? "" : filters.statuses.join(","),
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

  function toggleStatus(key: StatusKey) {
    const current = selectedStatuses(vals.status);
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : STATUS_KEYS.filter((k) => current.includes(k) || k === key);
    if (next.length === 0) return; // at least one bucket stays selected
    const value = next.length === STATUS_KEYS.length ? "" : next.join(",");
    setVals((v) => ({ ...v, status: value }));
    const nextParams = { ...params };
    if (value) nextParams.status = value;
    else delete nextParams.status;
    // Status changes may leave the current tab (e.g. Saved → browse on /jobs).
    const target = statusAction ?? action;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(nextParams)) if (v) qs.set(k, v);
    qs.delete("take");
    const s = qs.toString();
    startTransition(() => router.push(s ? `${target}?${s}` : target));
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
        <div ref={statusRef} className="relative flex-1 basis-[150px]">
          <button
            type="button"
            onClick={() => setStatusOpen((o) => !o)}
            aria-haspopup="true"
            aria-expanded={statusOpen}
            className={`${control} flex w-full items-center justify-between gap-2 ${isApplied(vals.status) ? marked : idle}`}
          >
            <span className="truncate">{statusSummary(vals.status)}</span>
            <span
              aria-hidden
              className={`text-[10px] text-muted-foreground transition-transform ${statusOpen ? "rotate-180" : ""}`}
            >
              ▼
            </span>
          </button>
          {statusOpen ? (
            <div className="absolute left-0 top-full z-20 mt-1 w-52 rounded-xl border border-border bg-card p-1.5 shadow-xl">
              {STATUS_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={selectedStatuses(vals.status).includes(key)}
                    onChange={() => toggleStatus(key)}
                    className="size-4 accent-primary"
                  />
                  {STATUS_LABELS[key]}
                </label>
              ))}
            </div>
          ) : null}
        </div>
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
