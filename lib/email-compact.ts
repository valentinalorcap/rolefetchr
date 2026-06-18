// Job-alert emails (especially LinkedIn) are huge — ~170 KB of HTML that's 99%
// boilerplate, tracking, and invisible padding characters, with the actual
// postings buried as a handful of links. Compact them at storage time into small
// link-preserving text so the external agent that extracts the jobs gets clean,
// complete content (nothing gets truncated by a length cap).

// Zero-width / directional / soft-hyphen padding chars boards stuff emails with.
const INVISIBLE = new RegExp(
  "[\\u00ad\\u034f\\u200b-\\u200f\\u2028\\u2029\\u202a-\\u202e\\u2060\\ufeff]",
  "g",
);

/**
 * Reduce an HTML email to compact text that keeps every link inline as
 * "text (url)" (tracking query strings stripped), so postings stay extractable.
 */
export function compactEmail(html: string): string {
  return html
    .replace(/<(style|script|head|title)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Keep each link as "<text> (<url>)"; drop the tracking query string.
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
      const t = String(text).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const u = String(href).split("?")[0];
      return t ? ` ${t} (${u}) ` : ` (${u}) `;
    })
    .replace(/<\/(p|div|tr|td|li|h[1-6]|table)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&rsquo;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(INVISIBLE, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
