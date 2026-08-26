// Fetch a job posting's page and extract its description server-side, so
// reading an ad and storing it are one atomic step (the agent can't read a
// posting without it landing in the DB).
//
// Extraction strategy, in order of trust:
//   1. schema.org JSON-LD JobPosting.description — most job boards embed it and
//      it's exactly the posting body (verified content).
//   2. The page's <main>/<article>/<body> content with chrome stripped — a
//      best-effort fallback stored as UNVERIFIED (may contain page junk).

export type FetchDescriptionResult =
  | { ok: true; description: string; via: "json-ld" | "content" }
  | { ok: false; error: string };

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

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 2_000_000;

/** Fetch the posting URL and extract its description. Best-effort: sites that
 * block server-side reads (LinkedIn auth walls etc.) come back as ok: false. */
export async function fetchJobDescription(url: string): Promise<FetchDescriptionResult> {
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: `Not an http(s) URL: ${url}` };
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en,es;q=0.8",
      },
    });
    if (!res.ok) return { ok: false, error: `The page responded ${res.status}.` };
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const extracted = extractJobPostingDescription(html);
    if (!extracted) {
      return { ok: false, error: "No job description found in the page (likely an auth wall or a JS-only page)." };
    }
    return { ok: true, ...extracted };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Fetch failed: ${message}` };
  }
}
