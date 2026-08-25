"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Facets } from "@/lib/facets";
import {
  MAX_FRESH_DAYS,
  STATUS_KEYS,
  type JobFilters as Filters,
  type StatusKey,
} from "@/lib/jobs";
import { countFilteredJobs } from "@/lib/actions";
import { sourceMeta } from "@/lib/source-meta";
import { cn } from "@/lib/utils";

// The Filters drawer: a floating glass panel sliding in from the right,
// overlaying the cards (never squeezing them). It holds every filter — tag
// buckets, score floor, location, date sliders, company, source, technologies,
// eligibility — so the toolbar stays a single row. Selections apply on
// "Show N roles" and serialize to the URL; FilterChips (below) renders the
// applied state as removable chips.

export const STATUS_LABELS: Record<StatusKey, string> = {
  NONE: "Untagged",
  SAVED: "Saved",
  APPLIED: "Applied",
  NOT_INTERESTED: "Archived",
};

// What the tab itself defaults to (parsed from the page's default params), so
// the drawer and chips can tell "tab baseline" from "user-applied filter".
export interface FilterBaseline {
  minScore: number | null;
  statuses: StatusKey[];
}

interface Selection {
  statuses: StatusKey[]; // [] = every bucket (no tag filter)
  minScore: string; // "0" (any) | "30" | "50" | "70"
  eligible: string; // "" (any) | "true" | "false"
  sources: string[];
  fresh: number | null; // days, null = any
  ingested: number | null;
  evaluated: number | null;
  companies: string[];
  regions: string[];
  countries: string[];
  techs: string[];
}

const SCORE_OPTIONS: Array<[string, string]> = [
  ["0", "Any"],
  ["30", "30+"],
  ["50", "50+"],
  ["70", "70+"],
];

const ELIGIBLE_OPTIONS: Array<[string, string]> = [
  ["", "Any"],
  ["true", "Eligible"],
  ["false", "Not eligible"],
];

const minScoreValue = (min: number | null) => (min == null ? "0" : String(min));

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v) => b.includes(v));

// [] in a Selection means "all buckets"; expand for comparisons.
const effectiveStatuses = (statuses: StatusKey[]): StatusKey[] =>
  statuses.length === 0 ? [...STATUS_KEYS] : statuses;

function fromFilters(filters: Filters): Selection {
  return {
    statuses:
      filters.statuses.length === STATUS_KEYS.length ? [] : [...filters.statuses],
    minScore: minScoreValue(filters.minScore),
    eligible:
      filters.eligible === true ? "true" : filters.eligible === false ? "false" : "",
    sources: [...filters.sources],
    fresh: filters.fresh,
    ingested: filters.ingested,
    evaluated: filters.evaluated,
    companies: filters.companies,
    regions: filters.regions,
    countries: filters.countries,
    techs: filters.techs,
  };
}

function toParams(
  params: Record<string, string>,
  filters: Filters,
  sel: Selection,
): Record<string, string> {
  const next = { ...params };
  const set = (key: string, value: string) => {
    if (value) next[key] = value;
    else delete next[key];
  };

  if (!sameSet(effectiveStatuses(sel.statuses), filters.statuses)) {
    set(
      "status",
      sel.statuses.length === 0
        ? ""
        : STATUS_KEYS.filter((k) => sel.statuses.includes(k)).join(","),
    );
  }
  // minScore only when changed: absent means "tab default", which is not "0".
  if (sel.minScore !== minScoreValue(filters.minScore)) next.minScore = sel.minScore;
  set("eligible", sel.eligible);
  set("source", sel.sources.join(","));
  set("fresh", sel.fresh != null ? `${sel.fresh}d` : "");
  set("ingested", sel.ingested != null ? `${sel.ingested}d` : "");
  set("evaluated", sel.evaluated != null ? `${sel.evaluated}d` : "");
  set("company", sel.companies.join(","));
  set("region", sel.regions.join(","));
  set("country", sel.countries.join(","));
  set("tech", sel.techs.join(","));
  delete next.take;
  return next;
}

function pushUrl(
  router: ReturnType<typeof useRouter>,
  action: string,
  params: Record<string, string>,
  start: (cb: () => void) => void,
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  const s = qs.toString();
  start(() => router.push(s ? `${action}?${s}` : action));
}

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

const dayLabel = (days: number | null): string => {
  if (days == null) return "Any";
  if (days === 1) return "Last 24h";
  if (days % 7 === 0) return `Last ${days / 7} week${days > 7 ? "s" : ""}`;
  return `Last ${days} days`;
};

const dayChip = (days: number) => (days === 1 ? "24h" : `${days}d`);

const DATE_FIELDS = [
  ["fresh", "Published"],
  ["ingested", "Ingested"],
  ["evaluated", "Evaluated"],
] as const;
type DateField = (typeof DATE_FIELDS)[number][0];

export function FiltersDrawer({
  facets,
  filters,
  baseline,
  params,
  action,
  statusAction,
  hideIngested = false,
  companyLabel,
}: {
  facets: Facets;
  filters: Filters;
  baseline: FilterBaseline;
  params: Record<string, string>;
  action: string;
  // Where to navigate when the tag selection changes (Saved/Applied/Archived
  // point this at /jobs — picking other buckets means "browse").
  statusAction?: string;
  hideIngested?: boolean;
  // In a demo, the MANUAL source is the company's own board — label it so.
  companyLabel?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Selection>(() => fromFilters(filters));
  const [groups, setGroups] = useState({
    tag: true,
    score: false,
    location: false,
    dates: false,
    company: false,
    source: false,
    tech: false,
    eligible: false,
  });
  const [companyQuery, setCompanyQuery] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const sourceLabel = (name: string) =>
    name === "MANUAL" && companyLabel
      ? companyLabel
      : sourceMeta(name as Facets["sources"][number]["name"]).label;

  const appliedCount = countSelections(fromFilters(filters), baseline);

  function openDrawer() {
    setSel(fromFilters(filters));
    setCompanyQuery("");
    setCount(null);
    setOpen(true);
  }

  // Escape closes without applying.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Live count for the pending selection (debounced server action). The
  // request id guards against slow responses landing out of order.
  const countReq = useRef(0);
  useEffect(() => {
    if (!open) return;
    clearTimeout(debounce.current);
    const req = ++countReq.current;
    setCount(null);
    debounce.current = setTimeout(async () => {
      try {
        const n = await countFilteredJobs(toParams(params, filters, sel), action);
        if (countReq.current === req) setCount(n);
      } catch {
        if (countReq.current === req) setCount(null);
      }
    }, 250);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sel]);

  const pendingCount = countSelections(sel, baseline);

  const visibleCompanies = useMemo(
    () =>
      facets.companies.filter((c) =>
        c.label.toLowerCase().includes(companyQuery.toLowerCase()),
      ),
    [facets.companies, companyQuery],
  );

  function apply() {
    setOpen(false);
    const statusChanged = !sameSet(effectiveStatuses(sel.statuses), filters.statuses);
    const target = statusChanged && statusAction ? statusAction : action;
    pushUrl(router, target, toParams(params, filters, sel), startTransition);
  }

  function clear() {
    setSel({
      statuses:
        baseline.statuses.length === STATUS_KEYS.length ? [] : [...baseline.statuses],
      minScore: minScoreValue(baseline.minScore),
      eligible: "",
      sources: [],
      fresh: null,
      ingested: null,
      evaluated: null,
      companies: [],
      regions: [],
      countries: [],
      techs: [],
    });
  }

  const groupHeader = (
    key: keyof typeof groups,
    label: string,
    selected: number,
  ) => (
    <button
      type="button"
      onClick={() => setGroups((g) => ({ ...g, [key]: !g[key] }))}
      className="flex w-full items-center justify-between border-t border-border py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground first:border-t-0"
    >
      {label}
      <span className="flex items-center gap-2 normal-case tracking-normal">
        {selected > 0 ? (
          <span className="font-medium text-primary">{selected} selected</span>
        ) : null}
        <span className={cn("text-[9px] transition-transform", groups[key] && "rotate-180")}>▼</span>
      </span>
    </button>
  );

  const checkboxRow = (
    label: string,
    count: number,
    checked: boolean,
    onChange: () => void,
    indent = false,
  ) => (
    <label
      key={label}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-white/5",
        indent && "ml-5",
      )}
    >
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 shrink-0 accent-primary" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{count}</span>
    </label>
  );

  const pill = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-xs transition-colors",
        on
          ? "border-ring/60 bg-primary/12 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  const dateSlider = (field: DateField, label: string) => {
    const value = sel[field];
    return (
      <div key={field} className="pb-2.5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className={cn("font-semibold", value != null ? "text-primary" : "text-muted-foreground")}>
            {dayLabel(value)}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={MAX_FRESH_DAYS + 1}
          step={1}
          value={value ?? MAX_FRESH_DAYS + 1}
          onChange={(e) => {
            const n = Number(e.target.value);
            setSel((s) => ({ ...s, [field]: n > MAX_FRESH_DAYS ? null : n }));
          }}
          aria-label={label}
          className="h-5 w-full cursor-pointer accent-primary"
        />
        <div className="-mt-0.5 flex justify-between text-[9px] text-muted-foreground/70">
          <span>24h</span>
          <span>1w</span>
          <span>2w</span>
          <span>3w</span>
          <span>Any</span>
        </div>
      </div>
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        aria-expanded={open}
        className={cn(
          "h-9 shrink-0 rounded-lg border px-3 text-sm font-medium text-foreground transition-colors",
          appliedCount > 0
            ? "border-white/20 bg-primary/12 hover:border-ring/60"
            : "border-border bg-card/80 hover:border-ring/60",
        )}
      >
        ☰ Filters
        {appliedCount > 0 ? (
          <span className="ml-1.5 text-primary">· {appliedCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
      ) : null}

      <aside
        aria-label="Filters"
        className={cn(
          "fixed bottom-3 right-3 top-3 z-50 flex w-[300px] flex-col rounded-2xl border border-border bg-[#141418]/75 shadow-2xl backdrop-blur-xl transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-[110%]",
        )}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <span className="text-sm font-bold">Filters</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
            className="px-1 text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          {groupHeader("tag", "Tag", sel.statuses.length)}
          {groups.tag ? (
            <div className="flex flex-wrap gap-1.5 pb-3 pt-0.5">
              {STATUS_KEYS.map((key) =>
                pill(STATUS_LABELS[key], sel.statuses.includes(key), () =>
                  setSel((s) => ({
                    ...s,
                    statuses: STATUS_KEYS.filter((k) =>
                      toggle(s.statuses, key).includes(k),
                    ),
                  })),
                ),
              )}
            </div>
          ) : null}

          {groupHeader("score", "Score", sel.minScore !== minScoreValue(baseline.minScore) ? 1 : 0)}
          {groups.score ? (
            <div className="flex flex-wrap gap-1.5 pb-3 pt-0.5">
              {SCORE_OPTIONS.map(([value, label]) =>
                pill(label, sel.minScore === value, () =>
                  setSel((s) => ({ ...s, minScore: value })),
                ),
              )}
            </div>
          ) : null}

          {groupHeader("location", "Location", sel.regions.length + sel.countries.length)}
          {groups.location ? (
            <div className="pb-2.5">
              {facets.locations.map((loc) => (
                <div key={loc.region}>
                  {checkboxRow(loc.region, loc.count, sel.regions.includes(loc.region), () =>
                    setSel((s) => ({ ...s, regions: toggle(s.regions, loc.region) })),
                  )}
                  {loc.countries.map((c) =>
                    checkboxRow(c.name, c.count, sel.countries.includes(c.name), () =>
                      setSel((s) => ({ ...s, countries: toggle(s.countries, c.name) })),
                      true,
                    ),
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {groupHeader(
            "dates",
            "Dates",
            [sel.fresh, sel.ingested, sel.evaluated].filter((v) => v != null).length,
          )}
          {groups.dates ? (
            <div className="pt-0.5">
              {DATE_FIELDS.filter(([field]) => !(hideIngested && field === "ingested")).map(
                ([field, label]) => dateSlider(field, label),
              )}
            </div>
          ) : null}

          {groupHeader("company", "Company", sel.companies.length)}
          {groups.company ? (
            <div className="pb-2.5">
              <input
                type="search"
                value={companyQuery}
                onChange={(e) => setCompanyQuery(e.target.value)}
                placeholder="Find a company…"
                className="mb-1.5 h-8 w-full rounded-lg border border-border bg-secondary px-2.5 text-sm outline-none focus-visible:border-ring"
              />
              <div className="max-h-56 overflow-y-auto">
                {visibleCompanies.slice(0, 30).map((c) =>
                  checkboxRow(c.label, c.count, sel.companies.includes(c.key), () =>
                    setSel((s) => ({ ...s, companies: toggle(s.companies, c.key) })),
                  ),
                )}
                {visibleCompanies.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-muted-foreground">No companies match.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {groupHeader("source", "Source", sel.sources.length)}
          {groups.source ? (
            <div className="pb-2.5">
              {facets.sources.map((s) =>
                checkboxRow(sourceLabel(s.name), s.count, sel.sources.includes(s.name), () =>
                  setSel((prev) => ({ ...prev, sources: toggle(prev.sources, s.name) })),
                ),
              )}
            </div>
          ) : null}

          {groupHeader("tech", "Technologies", sel.techs.length)}
          {groups.tech ? (
            <div className="flex flex-wrap gap-1.5 pb-3 pt-0.5">
              {facets.techs.map((t) => (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setSel((s) => ({ ...s, techs: toggle(s.techs, t.name) }))}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    sel.techs.includes(t.name)
                      ? "border-ring/60 bg-primary/12 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.name} · {t.count}
                </button>
              ))}
            </div>
          ) : null}

          {groupHeader("eligible", "Eligibility", sel.eligible ? 1 : 0)}
          {groups.eligible ? (
            <div className="flex flex-wrap gap-1.5 pb-3 pt-0.5">
              {ELIGIBLE_OPTIONS.map(([value, label]) =>
                pill(label, sel.eligible === value, () =>
                  setSel((s) => ({ ...s, eligible: value })),
                ),
              )}
            </div>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-border p-3.5">
          <button
            type="button"
            onClick={clear}
            disabled={pendingCount === 0}
            className="h-9 flex-1 rounded-lg border border-border text-sm font-semibold text-foreground disabled:opacity-40"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={apply}
            className="h-9 flex-[1.6] rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {count !== null ? `Show ${count} roles` : "Apply"}
          </button>
        </div>
      </aside>
    </>
  );
}

/** How many filters a selection carries beyond the tab's baseline (badge/Clear). */
function countSelections(sel: Selection, baseline: FilterBaseline): number {
  const tagCount = sameSet(effectiveStatuses(sel.statuses), baseline.statuses)
    ? 0
    : Math.max(sel.statuses.length, 1);
  return (
    tagCount +
    (sel.minScore !== minScoreValue(baseline.minScore) ? 1 : 0) +
    (sel.eligible ? 1 : 0) +
    sel.sources.length +
    [sel.fresh, sel.ingested, sel.evaluated].filter((v) => v != null).length +
    sel.companies.length +
    sel.regions.length +
    sel.countries.length +
    sel.techs.length
  );
}

/** Applied-filters bar: removable chips + Clear all, below the toolbar. */
export function FilterChips({
  facets,
  filters,
  baseline,
  params,
  action,
  companyLabel,
}: {
  facets: Facets;
  filters: Filters;
  baseline: FilterBaseline;
  params: Record<string, string>;
  action: string;
  companyLabel?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const companyFor = (key: string) =>
    facets.companies.find((c) => c.key === key)?.label ?? key;
  const sourceFor = (name: string) =>
    name === "MANUAL" && companyLabel
      ? companyLabel
      : sourceMeta(name as Facets["sources"][number]["name"]).label;

  interface Chip {
    param: string;
    value: string; // "" = the param is removed whole (single-value filters)
    label: string;
    prefix?: string;
  }

  const chips: Chip[] = [];
  if (!sameSet(filters.statuses, baseline.statuses)) {
    for (const key of filters.statuses)
      chips.push({ param: "status", value: key, label: STATUS_LABELS[key], prefix: "tag" });
  }
  if (filters.minScore !== baseline.minScore) {
    chips.push({
      param: "minScore",
      value: "",
      label: filters.minScore == null ? "any" : `${filters.minScore}+`,
      prefix: "score",
    });
  }
  if (filters.eligible !== null) {
    chips.push({
      param: "eligible",
      value: "",
      label: filters.eligible ? "Eligible" : "Not eligible",
    });
  }
  for (const s of filters.sources)
    chips.push({ param: "source", value: s, label: sourceFor(s) });
  for (const [field, prefix] of [
    ["fresh", "published"],
    ["ingested", "ingested"],
    ["evaluated", "evaluated"],
  ] as const) {
    const days = filters[field];
    if (days != null) chips.push({ param: field, value: "", label: dayChip(days), prefix });
  }
  for (const c of filters.companies)
    chips.push({ param: "company", value: c, label: companyFor(c) });
  for (const r of filters.regions)
    chips.push({ param: "region", value: r, label: r });
  for (const c of filters.countries)
    chips.push({ param: "country", value: c, label: c });
  for (const t of filters.techs)
    chips.push({ param: "tech", value: t, label: t });

  if (chips.length === 0) return null;

  function remove(param: string, value: string) {
    const next = { ...params };
    if (!value) {
      delete next[param];
    } else {
      const left = (next[param] ?? "")
        .split(",")
        .filter((v) => v.trim() && v.trim().toLowerCase() !== value.toLowerCase());
      if (left.length) next[param] = left.join(",");
      else delete next[param];
    }
    pushUrl(router, action, next, startTransition);
  }

  function clearAll() {
    const next = { ...params };
    for (const p of [
      "status", "minScore", "eligible", "source",
      "fresh", "ingested", "evaluated",
      "company", "region", "country", "tech",
    ])
      delete next[p];
    pushUrl(router, action, next, startTransition);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span
          key={`${c.param}:${c.value || c.label}`}
          className="inline-flex items-center gap-1 rounded-lg border border-ring/40 bg-primary/12 py-1 pl-2.5 pr-1.5 text-xs font-medium"
        >
          {c.prefix ? <span className="text-primary/80">{c.prefix}:</span> : null}
          {c.label}
          <button
            type="button"
            onClick={() => remove(c.param, c.value)}
            aria-label={`Remove ${c.label}`}
            className="px-0.5 text-muted-foreground hover:text-[#e3909e]"
          >
            ×
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={clearAll}
        className="text-xs text-muted-foreground underline hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  );
}
