// Fetch a job posting's page and extract its description server-side, so
// reading an ad and storing it are one atomic step (the agent can't read a
// posting without it landing in the DB).
//
// Extraction strategy, in order of trust:
//   1. LinkedIn's public jobs-guest endpoint — returns exactly the posting
//      body for /jobs/view/ URLs (verified; the full page serves a logged-out
//      version without JSON-LD).
//   2. schema.org JSON-LD JobPosting.description — most job boards embed it
//      and it's exactly the posting body (verified content).
//   3. The page's <main>/<article>/<body> content with chrome stripped — a
//      best-effort fallback stored as UNVERIFIED (may contain page junk).
//
// Failures are split into `blocked` (the source refused the request — the
// agent should fetch from its own network instead) and real failures (dead
// URL, timeout, nothing extractable).

export type FetchDescriptionResult =
  | { ok: true; description: string; via: "linkedin-api" | "json-ld" | "content" }
  | { ok: false; blocked: boolean; error: string };

const NUMERIC_ENTITY = /&#(x?)([0-9a-f]+);/gi;
const NAMED_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

/** Decode the HTML entities JSON-LD blocks typically encode markup with. */
export function decodeEntities(text: string): string {
  return text
    .replace(NUMERIC_ENTITY, (_, hex, code) =>
      String.fromCodePoint(Number.parseInt(code, hex ? 16 : 10)),
    )
    .replace(/&[a-z]+;/gi, (m) => NAMED_ENTITIES[m.toLowerCase()] ?? m);
}

const plainLength = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length;

type JsonLdNode = { [key: string]: unknown };

function* jsonLdNodes(value: unknown): Generator<JsonLdNode> {
  if (Array.isArray(value)) {
    for (const v of value) yield* jsonLdNodes(v);
  } else if (value && typeof value === "object") {
    const node = value as JsonLdNode;
    yield node;
    if (node["@graph"]) yield* jsonLdNodes(node["@graph"]);
  }
}

/** Pure extraction over a page's HTML (exported for tests). */
export function extractJobPostingDescription(
  html: string,
): { description: string; via: "json-ld" | "content" } | null {
  // 1. JSON-LD JobPosting blocks.
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, body] of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.trim());
    } catch {
      continue;
    }
    for (const node of jsonLdNodes(parsed)) {
      const type = node["@type"];
      const isJobPosting = Array.isArray(type)
        ? type.includes("JobPosting")
        : type === "JobPosting";
      if (!isJobPosting || typeof node.description !== "string") continue;
      const description = decodeEntities(node.description).trim();
      if (plainLength(description) >= 100) return { description, via: "json-ld" };
    }
  }

  // 2. Main content with page chrome stripped (best-effort, unverified).
  let content = html
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " ");
  const region =
    /<main[^>]*>([\s\S]*?)<\/main>/i.exec(content) ??
    /<article[^>]*>([\s\S]*?)<\/article>/i.exec(content) ??
    /<body[^>]*>([\s\S]*?)<\/body>/i.exec(content);
  content = (region?.[1] ?? content).trim();
  if (plainLength(content) >= 300) return { description: content, via: "content" };

  return null;
}

/** LinkedIn's guest job endpoint returns the posting body inside this container. */
export function extractLinkedInGuestDescription(html: string): string | null {
  const match =
    /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  if (!match) return null;
  const description = match[1].trim();
  return plainLength(description) >= 100 ? description : null;
}

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 2_000_000;

// Statuses sources use to refuse automated reads (LinkedIn's infamous 999,
// rate limits, geo/legal walls) — distinguishable from a dead or broken page.
const BLOCKED_STATUS = new Set([401, 403, 407, 429, 451, 999]);
// A 200 that is really a logged-out interstitial, not the posting.
const BLOCK_MARKERS = /authwall|captcha|are you a robot|please log in|sign in to continue/i;
const BLOCK_URL = /authwall|checkpoint|\/login|\/uas\//i;

const LINKEDIN_VIEW = /linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i;

const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9,es;q=0.8",
};

/** Fetch the posting URL and extract its description. `blocked: true` means
 * the source refused the server's request — the caller should read the page
 * from another network instead of retrying here. */
export async function fetchJobDescription(url: string): Promise<FetchDescriptionResult> {
  if (!/^https?:\/\//i.test(url)) return { ok: false, blocked: false, error: `Not an http(s) URL: ${url}` };
  try {
    // LinkedIn: the full page serves a logged-out version with no JSON-LD; the
    // public jobs-guest endpoint returns the exact posting body instead.
    const linkedInId = LINKEDIN_VIEW.exec(url)?.[1];
    if (linkedInId) {
      const guest = await fetch(
        `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${linkedInId}`,
        { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: HEADERS },
      );
      if (BLOCKED_STATUS.has(guest.status)) {
        return { ok: false, blocked: true, error: `LinkedIn blocked the request (${guest.status}).` };
      }
      if (guest.ok) {
        const description = extractLinkedInGuestDescription(
          (await guest.text()).slice(0, MAX_HTML_BYTES),
        );
        if (description) return { ok: true, description, via: "linkedin-api" };
      }
      // Fall through to the regular page as a second chance.
    }

    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: HEADERS,
    });
    if (BLOCKED_STATUS.has(res.status)) {
      return { ok: false, blocked: true, error: `The source blocked the request (${res.status}).` };
    }
    if (!res.ok) return { ok: false, blocked: false, error: `The page responded ${res.status}.` };
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const extracted = extractJobPostingDescription(html);
    if (!extracted) {
      const blocked = BLOCK_URL.test(res.url) || BLOCK_MARKERS.test(html);
      return blocked
        ? { ok: false, blocked: true, error: "The source served a logged-out interstitial instead of the posting." }
        : { ok: false, blocked: false, error: "No job description found in the page (may be a JS-only page)." };
    }
    return { ok: true, ...extracted };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, blocked: false, error: `Fetch failed: ${message}` };
  }
}
