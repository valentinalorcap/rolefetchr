"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Facets } from "@/lib/facets";
import type { JobFilters as Filters } from "@/lib/jobs";
import { countFilteredJobs } from "@/lib/actions";
import { cn } from "@/lib/utils";

// The Filters drawer: a floating glass panel sliding in from the right,
// overlaying the cards (never squeezing them). Facet selections apply on
// "Show N roles" and serialize to the URL; FilterChips (below) renders the
// applied state as removable chips.

interface Selection {
  companies: string[];
  regions: string[];
  countries: string[];
  techs: string[];
}

const EMPTY: Selection = { companies: [], regions: [], countries: [], techs: [] };

function fromFilters(filters: Filters): Selection {
  return {
    companies: filters.companies,
    regions: filters.regions,
    countries: filters.countries,
    techs: filters.techs,
  };
}

function toParams(
  params: Record<string, string>,
  sel: Selection,
): Record<string, string> {
  const next = { ...params };
  const set = (key: string, values: string[]) => {
    if (values.length) next[key] = values.join(",");
    else delete next[key];
  };
  set("company", sel.companies);
  set("region", sel.regions);
  set("country", sel.countries);
  set("tech", sel.techs);
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

export function FiltersDrawer({
  facets,
  filters,
  params,
  action,
}: {
  facets: Facets;
  filters: Filters;
  params: Record<string, string>;
  action: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Selection>(EMPTY);
  const [groups, setGroups] = useState({ company: true, location: false, tech: false });
  const [companyQuery, setCompanyQuery] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const appliedCount =
    filters.companies.length + filters.regions.length +
    filters.countries.length + filters.techs.length;

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
        const n = await countFilteredJobs(toParams(params, sel), action);
        if (countReq.current === req) setCount(n);
      } catch {
        if (countReq.current === req) setCount(null);
      }
    }, 250);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sel]);

  const pendingCount =
    sel.companies.length + sel.regions.length + sel.countries.length + sel.techs.length;

  const visibleCompanies = useMemo(
    () =>
      facets.companies.filter((c) =>
        c.label.toLowerCase().includes(companyQuery.toLowerCase()),
      ),
    [facets.companies, companyQuery],
  );

  function apply() {
    setOpen(false);
    pushUrl(router, action, toParams(params, sel), startTransition);
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
        </div>

        <div className="flex gap-2 border-t border-border p-3.5">
          <button
            type="button"
            onClick={() => setSel(EMPTY)}
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

/** Applied-filters bar: removable chips + Clear all, below the filter rows. */
export function FilterChips({
  facets,
  filters,
  params,
  action,
}: {
  facets: Facets;
  filters: Filters;
  params: Record<string, string>;
  action: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const labelFor = (key: string) =>
    facets.companies.find((c) => c.key === key)?.label ?? key;

  const chips: Array<{ group: keyof Selection; param: string; value: string; label: string }> = [
    ...filters.companies.map((c) => ({ group: "companies" as const, param: "company", value: c, label: labelFor(c) })),
    ...filters.regions.map((r) => ({ group: "regions" as const, param: "region", value: r, label: r })),
    ...filters.countries.map((c) => ({ group: "countries" as const, param: "country", value: c, label: c })),
    ...filters.techs.map((t) => ({ group: "techs" as const, param: "tech", value: t, label: t })),
  ];
  if (chips.length === 0) return null;

  function remove(param: string, value: string) {
    const next = { ...params };
    const left = (next[param] ?? "")
      .split(",")
      .filter((v) => v.trim() && v.trim().toLowerCase() !== value.toLowerCase());
    if (left.length) next[param] = left.join(",");
    else delete next[param];
    pushUrl(router, action, next, startTransition);
  }

  function clearAll() {
    const next = { ...params };
    for (const p of ["company", "region", "country", "tech"]) delete next[p];
    pushUrl(router, action, next, startTransition);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span
          key={`${c.param}:${c.value}`}
          className="inline-flex items-center gap-1 rounded-lg border border-ring/40 bg-primary/12 py-1 pl-2.5 pr-1.5 text-xs font-medium"
        >
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
