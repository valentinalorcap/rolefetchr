import { XMLParser } from "fast-xml-parser";
import { decodeEntities } from "../description-fetch";

// Shared parsing for WP Job Manager boards (Jobspresso, EU Remote Jobs, ...):
// a WordPress RSS feed whose items carry the posting HTML in content:encoded
// and job metadata in a job_listing:* namespace. CDATA fields keep their
// HTML entities ("AI &amp; Data"), so every text accessor decodes them.

export interface WpJobItem {
  title?: string;
  link?: string;
  guid?: string | number;
  pubDate?: string;
  description?: string;
  "content:encoded"?: string;
  "dc:creator"?: string;
  "job_listing:company"?: string;
  "job_listing:location"?: string;
  "job_listing:salary"?: string;
  "job_listing:job_category"?: string;
  "job_listing:job_type"?: string;
}

const parser = new XMLParser({ ignoreAttributes: true });

export function parseWpJobFeed(xml: string): WpJobItem[] {
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: WpJobItem | WpJobItem[] } };
  };
  const item = parsed.rss?.channel?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

export const wpText = (v: string | number | undefined) =>
  v == null ? "" : decodeEntities(String(v)).trim();

/** Comma-separated taxonomy field → clean list. */
export const wpList = (v: string | number | undefined) =>
  wpText(v)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

// guid = https://<board>/?post_type=job_listing&#038;p=163413 → the post id
// (WordPress escapes the ampersand as a numeric entity).
export function wpPostId(item: WpJobItem): string | null {
  const guid = wpText(item.guid);
  const m = /(?:[?&]|&#0*38;|&amp;)p=(\d+)/.exec(String(item.guid ?? ""));
  if (m) return m[1];
  return guid || wpText(item.link) || null;
}

/** The posting body, falling back to the feed excerpt. */
export function wpBody(item: WpJobItem): string {
  return String(item["content:encoded"] ?? item.description ?? "").trim();
}
