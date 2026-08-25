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
  ["United States", /\b(united states|\busa?\b|u\.s\.|new york|brooklyn|san francisco|austin|seattle|boston|chicago|miami|denver|los angeles)\b/i],
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
  ["Australia", /\b(australia|sydney|melbourne|brisbane)\b/i],
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
  ["Worldwide", /\b(worldwide|anywhere|global|remote|distributed|international)\b/i],
];

/** Canonical country from a free-text location, or null when none is named. */
export function normalizeCountry(location: string | null | undefined): string | null {
  if (!location?.trim()) return null;
  for (const [name, re] of COUNTRIES) if (re.test(location)) return name;
  return null;
}

/**
 * Region bucket from a free-text location. A named country wins (its region);
 * otherwise explicit region words; a bare "Remote"/"Anywhere" is Worldwide;
 * anything else is null (shown as "Unspecified" in the facet).
 */
export function normalizeRegion(location: string | null | undefined): Region | null {
  if (!location?.trim()) return null;
  const country = normalizeCountry(location);
  if (country) return COUNTRY_REGION[country] ?? null;
  for (const [region, re] of REGION_PATTERNS) if (re.test(location)) return region;
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

// Work mode: HYBRID/ONSITE are detected only from the short, deliberate fields
// (location, title, tags) — descriptions mention "hybrid" too casually to be a
// reliable signal. Everything else stays REMOTE (all auto sources are remote
// boards). "Hybrid" wins when both appear ("hybrid, 2 days on-site").
const HYBRID_PATTERN = /\bhybrid\b|h[ií]brid[oa]/i;
const ONSITE_PATTERN = /\bon-?site\b|\bin[- ]office\b|\bpresencial\b/i;

export type WorkModeValue = "REMOTE" | "HYBRID" | "ONSITE";

export function detectWorkMode(
  location: string | null | undefined,
  title: string,
  tags: string[],
): WorkModeValue {
  const text = [location ?? "", title, ...tags].join(" ");
  if (HYBRID_PATTERN.test(text)) return "HYBRID";
  if (ONSITE_PATTERN.test(text)) return "ONSITE";
  return "REMOTE";
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
