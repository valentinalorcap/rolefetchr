import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";
import { stripHtml } from "@/lib/format";

const SEARCH_URL =
  "https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&query=who%20is%20hiring&hitsPerPage=5";

interface AlgoliaHit {
  objectID: string;
  title: string;
}
interface AlgoliaItem {
  id: number;
  author?: string;
  text?: string;
  created_at?: string;
  children?: AlgoliaItem[];
}

/** Find the most recent "Ask HN: Who is hiring?" thread id (skip "who wants to be hired"). */
async function latestHiringThreadId(): Promise<string | null> {
  const res = await fetch(SEARCH_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HN search responded ${res.status}`);
  const data = (await res.json()) as { hits?: AlgoliaHit[] };
  const hit = (data.hits ?? []).find((h) => /who is hiring/i.test(h.title));
  return hit?.objectID ?? null;
}

/** First "line" of a comment — the header before the first paragraph break. */
function headerOf(html: string): string {
  const head = html.split(/<p>|<br\s*\/?>/i)[0];
  return stripHtml(head);
}

function parseHeader(header: string): { company: string; role: string } {
  const parts = header.split("|").map((p) => p.trim());
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return { company: parts[0], role: parts[1] };
  }
  // No pipe convention — fall back to a truncated header as the title.
  const role = header.length > 110 ? `${header.slice(0, 110)}…` : header;
  return { company: "Hacker News — Who's hiring", role: role || "Job posting" };
}

export const hackerNewsSource: JobSource = {
  source: Source.HACKERNEWS,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const threadId = await latestHiringThreadId();
    if (!threadId) return [];

    const res = await fetch(`https://hn.algolia.com/api/v1/items/${threadId}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HN thread responded ${res.status}`);
    const thread = (await res.json()) as AlgoliaItem;

    return (thread.children ?? [])
      .filter((c) => c.text && /\bremote\b/i.test(c.text)) // remote-friendly only
      .map((c): NormalizedJob => {
        const header = headerOf(c.text!);
        const { company, role } = parseHeader(header);
        return {
          source: Source.HACKERNEWS,
          externalId: String(c.id),
          title: role,
          company,
          description: c.text!.trim(),
          location: "Remote",
          remote: true,
          salary: null,
          tags: [],
          sourceUrl: `https://news.ycombinator.com/item?id=${c.id}`,
          postedAt: c.created_at ? new Date(c.created_at) : new Date(),
        };
      });
  },
};
