// Normalizers that turn the free-text job fields into clean, filterable
// columns (Job.region / country / techs / companyKey). They run once per job
// at ingestion; the original text is never modified.

export const REGIONS = [
  "Worldwide",
  "Europe",
  "North America",
  "LatAm",
  "Asia & Pacific",
  "Africa & Middle East",
] as const;
export type Region = (typeof REGIONS)[number];

// Country detection: canonical English name ← pattern over the location text.
// Cities and demonyms map to their country so "Berlin" and "Germany (Remote)"
// land together. Ordered roughly by frequency in the live dataset.
const COUNTRIES: Array<[string, RegExp]> = [
  ["United States", /\b(united states|usa?|u\.s\.?(a\.?)?|new york|brooklyn|san francisco|austin|seattle|boston|chicago|miami|denver|los angeles)(?![a-z])/i],
  ["United Kingdom", /\b(united kingdom|\buk\b|england|scotland|wales|london|manchester|bristol|edinburgh)\b/i],
  ["Germany", /\b(germany|berlin|munich|münchen|hamburg|cologne|köln|deutschland)\b/i],
  ["Netherlands", /\b(netherlands|amsterdam|utrecht|rotterdam|the hague|holland)\b/i],
  ["Spain", /\b(spain|madrid|barcelona|valencia|españa|sevilla)\b/i],
  ["France", /\b(france|paris|lyon|bordeaux)\b/i],
  ["Portugal", /\b(portugal|lisbon|lisboa|porto)\b/i],
  ["Ireland", /\b(ireland|dublin)\b/i],
  ["Poland", /\b(poland|warsaw|krakow|kraków|wroclaw|wrocław)\b/i],
  ["Denmark", /\b(denmark|copenhagen)\b/i],
  ["Sweden", /\b(sweden|stockholm|gothenburg)\b/i],
  ["Norway", /\b(norway|oslo)\b/i],
  ["Finland", /\b(finland|helsinki)\b/i],
  ["Switzerland", /\b(switzerland|zurich|zürich|geneva)\b/i],
  ["Austria", /\b(austria|vienna|wien)\b/i],
  ["Belgium", /\b(belgium|brussels|antwerp)\b/i],
  ["Italy", /\b(italy|milan|milano|rome|roma)\b/i],
  ["Greece", /\b(greece|athens)\b/i],
  ["Czechia", /\b(czech|prague|praha)\b/i],
  ["Romania", /\b(romania|bucharest)\b/i],
  ["Ukraine", /\b(ukraine|kyiv|kiev)\b/i],
  ["Estonia", /\b(estonia|tallinn)\b/i],
  ["Canada", /\b(canada|toronto|vancouver|montreal|ottawa)\b/i],
  ["Mexico", /\b(mexico|méxico|cdmx|guadalajara|monterrey)\b/i],
  ["Chile", /\b(chile|santiago)\b/i],
  ["Argentina", /\b(argentina|buenos aires)\b/i],
  ["Brazil", /\b(brazil|brasil|são paulo|sao paulo|rio de janeiro)\b/i],
  ["Colombia", /\b(colombia|bogot[aá]|medell[ií]n)\b/i],
  ["Peru", /\b(peru|perú|lima)\b/i],
  ["Uruguay", /\b(uruguay|montevideo)\b/i],
  ["India", /\b(india|bangalore|bengaluru|mumbai|delhi|hyderabad|pune)\b/i],
  ["Japan", /\b(japan|tokyo|osaka)\b/i],
  ["Singapore", /\bsingapore\b/i],
  ["Australia", /\b(australia|sydney|melbourne|brisbane|perth|adelaide|canberra)\b/i],
  ["New Zealand", /\b(new zealand|auckland|wellington)\b/i],
  ["Philippines", /\b(philippines|manila)\b/i],
  ["Israel", /\b(israel|tel aviv)\b/i],
  ["United Arab Emirates", /\b(uae|dubai|abu dhabi)\b/i],
  ["South Africa", /\b(south africa|cape town|johannesburg)\b/i],
  ["Nigeria", /\b(nigeria|lagos)\b/i],
  ["Egypt", /\b(egypt|cairo)\b/i],
];

const COUNTRY_REGION: Record<string, Region> = {
  "United States": "North America",
  Canada: "North America",
  "United Kingdom": "Europe",
  Germany: "Europe",
  Netherlands: "Europe",
  Spain: "Europe",
  France: "Europe",
  Portugal: "Europe",
  Ireland: "Europe",
  Poland: "Europe",
  Denmark: "Europe",
  Sweden: "Europe",
  Norway: "Europe",
  Finland: "Europe",
  Switzerland: "Europe",
  Austria: "Europe",
  Belgium: "Europe",
  Italy: "Europe",
  Greece: "Europe",
  Czechia: "Europe",
  Romania: "Europe",
  Ukraine: "Europe",
  Estonia: "Europe",
  Mexico: "LatAm",
  Chile: "LatAm",
  Argentina: "LatAm",
  Brazil: "LatAm",
  Colombia: "LatAm",
  Peru: "LatAm",
  Uruguay: "LatAm",
  India: "Asia & Pacific",
  Japan: "Asia & Pacific",
  Singapore: "Asia & Pacific",
  Australia: "Asia & Pacific",
  "New Zealand": "Asia & Pacific",
  Philippines: "Asia & Pacific",
  Israel: "Africa & Middle East",
  "United Arab Emirates": "Africa & Middle East",
  "South Africa": "Africa & Middle East",
  Nigeria: "Africa & Middle East",
  Egypt: "Africa & Middle East",
};

const REGION_PATTERNS: Array<[Region, RegExp]> = [
  ["Europe", /\b(europe|emea|european|cet|eu (remote|only|based)|eu\b)/i],
  ["LatAm", /\b(latam|latin america|south america)\b/i],
  ["North America", /\b(north america|namer)\b/i],
  ["Asia & Pacific", /\b(asia|apac|oceania)\b/i],
  ["Africa & Middle East", /\b(africa|middle east)\b/i],
  ["Worldwide", /\b(worldwide|anywhere|global(ly)?|remote|distributed|international(ly)?)\b/i],
];

// Free-text locations are often lists ("Europe, LATAM, APAC, the U.S.,
// Canada"), restrictions ("USA only") or exclusions ("Internationally located
// (not in the US, CA, UK)"). Exclusions are dropped before matching — the
// places they name are exactly where the job is NOT open — and lists are
// matched part by part, so the first-listed place decides.
const EXCLUSION = /\b(?:not (?:in|from|based)|except(?:ing)?|excluding|outside(?: of)?|other than)\b[^)]*\)?/gi;
const PART_SPLIT = /\s*(?:[,;/|&]|\band\b|\bor\b)\s*/i;

function locationParts(location: string): string[] {
  return location
    .replace(EXCLUSION, " ")
    .replace(/\(\s*(\)|$)/g, " ")
    .split(PART_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);
}

function countryOf(part: string): string | null {
  for (const [name, re] of COUNTRIES) if (re.test(part)) return name;
  return null;
}

/**
 * Canonical country from a free-text location, or null when none is named —
 * or when several are (a multi-country list is not "a country").
 */
export function normalizeCountry(location: string | null | undefined): string | null {
  if (!location?.trim()) return null;
  const found = new Set<string>();
  for (const part of locationParts(location)) {
    const c = countryOf(part);
    if (c) found.add(c);
  }
  return found.size === 1 ? [...found][0] : null;
}

/**
 * Region bucket from a free-text location. A single named country wins (its
 * region); otherwise the first listed part that names a country or a region;
 * a bare "Remote"/"Anywhere" is Worldwide; anything else is null (shown as
 * "Unspecified" in the facet).
 */
export function normalizeRegion(location: string | null | undefined): Region | null {
  if (!location?.trim()) return null;
  const country = normalizeCountry(location);
  if (country) return COUNTRY_REGION[country] ?? null;
  for (const part of locationParts(location)) {
    const c = countryOf(part);
    if (c) return COUNTRY_REGION[c] ?? null;
    for (const [region, re] of REGION_PATTERNS) if (re.test(part)) return region;
  }
  return null;
}

// Curated tech vocabulary for the Technologies facet. Key = canonical name
// stored in Job.techs; pattern matched against title + tags + description.
const TECHS: Array<[string, RegExp]> = [
  ["typescript", /\btypescript|\bts\b(?![a-z])/i],
  ["javascript", /\bjavascript|\bjs\b(?![a-z])/i],
  ["react", /\breact(?!\s*native)\b/i],
  ["react native", /\breact\s*native\b/i],
  ["angular", /\bangular/i],
  ["vue", /\bvue(\.?js)?\b/i],
  ["svelte", /\bsvelte/i],
  ["next.js", /\bnext\.?js\b/i],
  ["node", /\bnode(\.?js)?\b/i],
  ["nestjs", /\bnest\.?js\b/i],
  ["express", /\bexpress(\.?js)?\b/i],
  ["python", /\bpython\b/i],
  ["django", /\bdjango\b/i],
  ["ruby", /\bruby\b/i],
  ["rails", /\b(ruby on )?rails\b/i],
  ["php", /\bphp\b/i],
  ["laravel", /\blaravel\b/i],
  ["go", /\bgolang\b|\bgo (developer|engineer|experience)\b/i],
  ["rust", /\brust\b/i],
  ["java", /\bjava\b(?!script)/i],
  ["kotlin", /\bkotlin\b/i],
  ["spring", /\bspring( boot)?\b/i],
  [".net", /\.net\b|\bc#/i],
  ["swift", /\bswift\b/i],
  ["flutter", /\bflutter\b/i],
  ["postgres", /\bpostgres(ql)?\b/i],
  ["mysql", /\bmysql\b/i],
  ["mongodb", /\bmongo(db)?\b/i],
  ["redis", /\bredis\b/i],
  ["graphql", /\bgraphql\b/i],
  ["aws", /\baws\b|\bamazon web services\b/i],
  ["gcp", /\bgcp\b|\bgoogle cloud\b/i],
  ["azure", /\bazure\b/i],
  ["docker", /\bdocker\b/i],
  ["kubernetes", /\bkubernetes\b|\bk8s\b/i],
  ["terraform", /\bterraform\b/i],
  ["tailwind", /\btailwind\b/i],
];

/** Canonical tech names detected across a job's title, tags, and description. */
export function extractTechs(
  title: string,
  tags: string[] = [],
  description = "",
): string[] {
  const haystack = `${title}\n${tags.join(" ")}\n${description}`;
  const out: string[] = [];
  for (const [name, re] of TECHS) if (re.test(haystack)) out.push(name);
  return out;
}

// Trailing legal suffixes that make the same company look like two companies.
const LEGAL_SUFFIX =
  /[\s,.]+(inc|llc|ltd|limited|spa|s\.?l\.?|gmbh|corp|corporation|co|company|s\.?a\.?)\.?$/i;

/** Normalized company identity: "Huzzle Ltd." and "huzzle" share one key. */
export function companyKey(company: string): string {
  return company
    .toLowerCase()
    .replace(LEGAL_SUFFIX, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Earliest index in `text` where a known country/city pattern matches, or -1.
 * Used by the email parser to split "Company City, Region, Country" lines:
 * everything before the first place-name is the company.
 */
export function locationMatchIndex(text: string): number {
  let earliest = -1;
  for (const [, pattern] of COUNTRIES) {
    const match = new RegExp(pattern.source, "i").exec(text);
    if (match && (earliest === -1 || match.index < earliest)) earliest = match.index;
  }
  return earliest;
}

/**
 * Soft-dedupe identity: the same posting reposted under different URLs (per
 * city/country) shares a fingerprint. Normalized company + normalized title —
 * deliberately ignores location, so per-city reposts group together.
 */
export function jobFingerprint(title: string, company: string): string {
  const t = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${companyKey(company)}::${t}`;
}

// Work mode: HYBRID/ONSITE are detected only from the short, deliberate fields
// (location, title, tags) — descriptions mention "hybrid" too casually to be a
// reliable signal. Everything else stays REMOTE, unless the source itself says
// the job is not remote (`remote: false`, e.g. a non-remote JSearch city query), in
// which case the fallback is ONSITE. "Hybrid" wins when both appear ("hybrid,
// 2 days on-site").
const HYBRID_PATTERN = /\bhybrid\b|h[ií]brid[oa]/i;
const ONSITE_PATTERN = /\bon-?site\b|\bin[- ]office\b|\bpresencial\b/i;

export type WorkModeValue = "REMOTE" | "HYBRID" | "ONSITE";

export function detectWorkMode(
  location: string | null | undefined,
  title: string,
  tags: string[],
  remote = true,
): WorkModeValue {
  const text = [location ?? "", title, ...tags].join(" ");
  if (HYBRID_PATTERN.test(text)) return "HYBRID";
  if (ONSITE_PATTERN.test(text)) return "ONSITE";
  return remote ? "REMOTE" : "ONSITE";
}

export type EngagementValue = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "FREELANCE";

// Engagement is read from explicit signals only — the source's own type field
// (already normalized into tags by the adapters: "Contract", "Part-time",
// "Freelance", "Full-time") and the title. Descriptions are left out on
// purpose: "contract" and "full-time" appear in most postings in unrelated
// sentences, and a guessed value is worse than none.
const ENGAGEMENT_PATTERNS: Array<[EngagementValue, RegExp]> = [
  ["FREELANCE", /\bfreelanc(e|er|ing)\b|\bproject[- ]based\b|\bper[- ]project\b|\bfixed[- ]price\b/i],
  ["PART_TIME", /\bpart[- ]?time\b|\bmedia jornada\b|\bmedio tiempo\b/i],
  ["CONTRACT", /\bcontract(or|ing)?\b|\bb2b\b|\bfixed[- ]term\b|\bfreiberuflich\b/i],
  ["FULL_TIME", /\bfull[- ]?time\b|\bjornada completa\b|\btiempo completo\b/i],
];

/**
 * The engagement a posting declares, or null when nothing explicit says so.
 * When several apply, the more specific arrangement wins ("full-time contract"
 * is a contract; "part-time freelance" is freelance).
 */
export function detectEngagement(title: string, tags: string[]): EngagementValue | null {
  const text = [title, ...tags].join(" | ");
  for (const [value, pattern] of ENGAGEMENT_PATTERNS) {
    if (pattern.test(text)) return value;
  }
  return null;
}

// Spanish → canonical English terms so the universal search understands both
// ("alemania" finds Germany, "europa" finds Europe). Countries/regions only.
const SEARCH_SYNONYMS: Record<string, string> = {
  alemania: "germany",
  francia: "france",
  espana: "spain",
  españa: "spain",
  "paises bajos": "netherlands",
  "países bajos": "netherlands",
  holanda: "netherlands",
  "reino unido": "united kingdom",
  inglaterra: "united kingdom",
  "estados unidos": "united states",
  eeuu: "united states",
  irlanda: "ireland",
  polonia: "poland",
  dinamarca: "denmark",
  suecia: "sweden",
  noruega: "norway",
  finlandia: "finland",
  suiza: "switzerland",
  italia: "italy",
  grecia: "greece",
  belgica: "belgium",
  bélgica: "belgium",
  austria: "austria",
  portugal: "portugal",
  chequia: "czechia",
  rumania: "romania",
  ucrania: "ukraine",
  canada: "canada",
  canadá: "canada",
  mexico: "mexico",
  méxico: "mexico",
  brasil: "brazil",
  japon: "japan",
  japón: "japan",
  australia: "australia",
  india: "india",
  israel: "israel",
  sudafrica: "south africa",
  sudáfrica: "south africa",
  egipto: "egypt",
  europa: "europe",
  latinoamerica: "latam",
  latinoamérica: "latam",
  norteamerica: "north america",
  norteamérica: "north america",
  mundial: "worldwide",
  "todo el mundo": "worldwide",
};

/** The search term plus its translation when a Spanish synonym is known. */
export function searchTerms(keyword: string): string[] {
  const kw = keyword.trim().toLowerCase();
  const translated = SEARCH_SYNONYMS[kw];
  return translated && translated !== kw ? [keyword.trim(), translated] : [keyword.trim()];
}
