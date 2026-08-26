import { locationMatchIndex } from "@/lib/normalize";
import type { WorkModeValue } from "@/lib/normalize";

// Deterministic parsing of forwarded job-alert emails (the Apps Script stores
// their plain-text body). LinkedIn and Jobgether alerts have a fixed line
// structure the server can parse without an LLM; anything else falls back to
// the raw content for the agent to read.

export interface ParsedEmailJob {
  title: string;
  company: string | null; // Jobgether alerts don't name the company
  location: string | null;
  salary: string | null;
  url: string; // canonical: tracking redirects decoded, utm params stripped
  workMode: WorkModeValue | null; // from the "(Hybrid)"-style badge, when present
}

export interface ParsedEmail {
  format: "linkedin" | "jobgether";
  jobs: ParsedEmailJob[];
}

/** Decode an awstrack.me redirect (SES click tracking) back to the real URL. */
export function decodeTrackingUrl(url: string): string {
  const wrapped = /awstrack\.me\/L0\/([^/\s)]+)/.exec(url);
  const decoded = wrapped ? decodeURIComponent(wrapped[1]) : url;
  return stripUtm(decoded);
}

function stripUtm(url: string): string {
  const [base, query] = url.split("?", 2);
  if (!query) return url;
  const kept = query
    .split("&")
    .filter((p) => p && !/^utm_/i.test(p));
  return kept.length ? `${base}?${kept.join("&")}` : base;
}

const MODE_SUFFIX = /\s*\((remote|hybrid|on-?site)\)\s*$/i;

function modeOf(text: string): WorkModeValue | null {
  const m = MODE_SUFFIX.exec(text);
  if (!m) return null;
  const mode = m[1].toLowerCase().replace("-", "");
  return mode === "hybrid" ? "HYBRID" : mode === "onsite" ? "ONSITE" : "REMOTE";
}

// Lines LinkedIn adds under a job card that aren't content.
const LINKEDIN_NOISE =
  /^(actively recruiting|fast growing|promoted|be an early applicant|easy apply|\d+\s+(school\s+)?alumn?i?|\d+\s+school alum|\d+\s+connections?|\d+\s+company alumni)$/i;

const SALARY_LINE = /(?:[€$£]\s?\d|\d+(?:\.\d+)?K?\s*\/\s*(?:month|year|yr|hour))/i;

const LINKEDIN_JOB_URL = /linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i;

const canonicalLinkedInUrl = (id: string) => `https://www.linkedin.com/jobs/view/${id}/`;

/**
 * Split LinkedIn's "Company City, Region, Country" line (no separator between
 * company and location). The location starts at the earliest known place-name;
 * "X de/of Y" city compounds ("Humanes de Madrid", "Community of Madrid")
 * extend the split backward. Single-token cities unknown to the pattern list
 * are recovered from the comma structure. Best-effort by nature.
 */
export function splitCompanyLocation(line: string): {
  company: string;
  location: string | null;
} {
  const mode = MODE_SUFFIX.exec(line);
  const core = mode ? line.slice(0, mode.index).trimEnd() : line;

  let idx = locationMatchIndex(core);
  // Extend backward over city compounds: "Humanes de <Madrid>", "Community of <Madrid>".
  const CONNECTOR = /([A-ZÀ-ÖØ-Þ][\p{L}'’-]*\s+(?:de(?:\s+(?:la|los|las|el))?|del|of)\s+)$/u;
  while (idx > 0) {
    const ext = CONNECTOR.exec(core.slice(0, idx));
    if (!ext) break;
    idx -= ext[1].length;
  }
  // If the first place-name sits after a comma, the (unknown) city is the last
  // word of the pre-comma segment: "Ria Money Transfer Alcobendas, ... Spain".
  const firstComma = core.indexOf(",");
  if (idx > firstComma && firstComma > 0) {
    const segment = core.slice(0, firstComma);
    const lastSpace = segment.lastIndexOf(" ");
    idx = lastSpace > 0 ? lastSpace + 1 : -1;
  }

  if (idx <= 0) {
    return { company: core.trim(), location: mode ? mode[0].trim().replace(/^\(|\)$/g, "") : null };
  }
  const company = core.slice(0, idx).trim();
  const location = line.slice(idx).trim();
  return { company: company || core.trim(), location: location || null };
}

function parseLinkedIn(lines: string[]): ParsedEmailJob[] {
  const jobs: ParsedEmailJob[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    // A card starts with a bare "(https://…/jobs/view/<id>…)" line.
    const bare = /^\((https?:\/\/\S+)\)$/.exec(lines[i]);
    const id = bare && LINKEDIN_JOB_URL.exec(bare[1])?.[1];
    if (!id) continue;

    // Next non-empty line: "Title (same url)".
    let j = i + 1;
    while (j < lines.length && !lines[j]) j++;
    const titleMatch = /^(.+?)\s*\(https?:\/\/\S+\)$/.exec(lines[j] ?? "");
    if (!titleMatch || !LINKEDIN_JOB_URL.test(lines[j])) continue;
    const title = titleMatch[1].trim();

    // Next non-empty line: "Company City, Region, Country (Mode)".
    let k = j + 1;
    while (k < lines.length && !lines[k]) k++;
    const companyLine = lines[k] ?? "";
    const { company, location } = splitCompanyLocation(companyLine);
    const workMode = modeOf(companyLine);

    // Trailing card lines until the next card: salary if present, noise otherwise.
    let salary: string | null = null;
    for (let m = k + 1; m < lines.length; m++) {
      const line = lines[m];
      if (!line || LINKEDIN_NOISE.test(line)) continue;
      if (/^\(https?:\/\/\S+\)$/.test(line) || /\(https?:\/\/\S+\)$/.test(line)) break;
      if (SALARY_LINE.test(line)) salary = line;
    }

    const url = canonicalLinkedInUrl(id);
    if (seen.has(url)) continue;
    seen.add(url);
    jobs.push({ title, company, location, salary, url, workMode });
  }
  return jobs;
}

function parseJobgether(lines: string[]): ParsedEmailJob[] {
  const jobs: ParsedEmailJob[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < lines.length; i++) {
    const match = /^(.+?)\s*\((https?:\/\/\S+)\)$/.exec(lines[i]);
    if (!match) continue;
    const url = decodeTrackingUrl(match[2]);
    if (!/jobgether\.com\/offer\//i.test(url)) continue;

    let salary: string | null = null;
    let location: string | null = null;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line) continue;
      if (/\(https?:\/\/\S+\)$/.test(line)) break; // next card / footer link
      const salaryMatch = /^Salary:\s*(.+)$/i.exec(line);
      if (salaryMatch) salary = salaryMatch[1].trim();
      if (/^Remote from:/i.test(line)) location = line.trim();
    }

    if (seen.has(url)) continue;
    seen.add(url);
    jobs.push({
      title: match[1].trim(),
      company: null,
      location,
      salary,
      url,
      workMode: location ? "REMOTE" : null,
    });
  }
  return jobs;
}

/** Parse a stored alert-email body into structured jobs, or null if the
 * format isn't recognized (the agent then reads the raw content instead). */
export function parseAlertEmail(body: string): ParsedEmail | null {
  const lines = body.split("\n").map((l) => l.trim());
  const linkedin = parseLinkedIn(lines);
  if (linkedin.length > 0) return { format: "linkedin", jobs: linkedin };
  const jobgether = parseJobgether(lines);
  if (jobgether.length > 0) return { format: "jobgether", jobs: jobgether };
  return null;
}
