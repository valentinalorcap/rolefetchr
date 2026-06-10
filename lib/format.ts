import { formatDistanceToNow } from "date-fns";

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/** Strip HTML tags and decode common entities into a clean plain-text string. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Plain-text snippet of an HTML description, truncated on a word boundary. */
export function snippet(html: string, max = 220): string {
  const text = stripHtml(html);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`;
}

/** "3 hours ago" style relative time. */
export function relativeTime(date: Date): string {
  return formatDistanceToNow(date, { addSuffix: true });
}
