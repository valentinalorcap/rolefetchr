import { prisma } from "@/lib/prisma";
import { REGIONS } from "@/lib/normalize";

// Facet data for the Filters drawer: every option with its live count,
// scoped to the current tenant. Companies are grouped by normalized key and
// labeled with their most frequent display spelling.

export interface CompanyFacet {
  key: string;
  label: string;
  count: number;
}
export interface LocationFacet {
  region: string; // a REGIONS value or "Unspecified"
  count: number;
  countries: Array<{ name: string; count: number }>;
}
export interface TechFacet {
  name: string;
  count: number;
}
export interface Facets {
  companies: CompanyFacet[];
  locations: LocationFacet[];
  techs: TechFacet[];
}

export interface FacetRow {
  company: string;
  companyKey: string | null;
  region: string | null;
  country: string | null;
  techs: string[];
}

// Companies beyond this stay reachable via search/keyword, just not listed.
const MAX_COMPANIES = 120;

/** Pure aggregation over the per-job rows (exported for tests). */
export function buildFacets(rows: FacetRow[]): Facets {
  // Companies: group by key, pick the most frequent spelling as the label.
  const byKey = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const r of rows) {
    const key = r.companyKey ?? r.company.toLowerCase();
    const entry = byKey.get(key) ?? { count: 0, spellings: new Map() };
    entry.count++;
    entry.spellings.set(r.company, (entry.spellings.get(r.company) ?? 0) + 1);
    byKey.set(key, entry);
  }
  const companies = [...byKey.entries()]
    .map(([key, e]) => ({
      key,
      label: [...e.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: e.count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, MAX_COMPANIES);

  // Locations: region buckets with country sub-counts.
  const regionMap = new Map<string, { count: number; countries: Map<string, number> }>();
  for (const r of rows) {
    const region = r.region ?? "Unspecified";
    const entry = regionMap.get(region) ?? { count: 0, countries: new Map() };
    entry.count++;
    if (r.country)
      entry.countries.set(r.country, (entry.countries.get(r.country) ?? 0) + 1);
    regionMap.set(region, entry);
  }
  const order = [...REGIONS, "Unspecified"];
  const locations = [...regionMap.entries()]
    .map(([region, e]) => ({
      region,
      count: e.count,
      countries: [...e.countries.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => order.indexOf(a.region) - order.indexOf(b.region));

  // Techs: straightforward counts over the arrays.
  const techMap = new Map<string, number>();
  for (const r of rows)
    for (const t of r.techs) techMap.set(t, (techMap.get(t) ?? 0) + 1);
  const techs = [...techMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { companies, locations, techs };
}

/** Facets for the tenant's whole job set (one indexed query + JS grouping). */
export async function getFacets(demoCode: string | null): Promise<Facets> {
  const rows = await prisma.job.findMany({
    where: { demoCode },
    select: { company: true, companyKey: true, region: true, country: true, techs: true },
  });
  return buildFacets(rows);
}
