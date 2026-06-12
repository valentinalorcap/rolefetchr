import type { Source } from "@prisma/client";

export interface SourceMeta {
  label: string; // display name
  code: string; // 1-2 char monogram
  color: string; // accent hex (text + tinted bg)
}

const SOURCES: Record<Source, SourceMeta> = {
  REMOTEOK: { label: "RemoteOK", code: "RO", color: "#5ac8fa" },
  REMOTIVE: { label: "Remotive", code: "Rv", color: "#bf83ff" },
  WEWORKREMOTELY: { label: "WeWorkRemotely", code: "WW", color: "#7fdcff" },
  HACKERNEWS: { label: "Hacker News", code: "HN", color: "#ffb340" },
  HIMALAYAS: { label: "Himalayas", code: "Hi", color: "#5fe08a" },
  JSEARCH: { label: "JSearch", code: "JS", color: "#64d2ff" },
  EMAIL: { label: "Email", code: "✉", color: "#ff7a98" },
  MANUAL: { label: "Manual", code: "M", color: "#aeb0b6" },
};

// Common publishers that arrive via JSearch / Email / Manual (sourceLabel).
const PUBLISHERS: Record<string, SourceMeta> = {
  linkedin: { label: "LinkedIn", code: "in", color: "#5ac8fa" },
  indeed: { label: "Indeed", code: "In", color: "#8e9bff" },
  glassdoor: { label: "Glassdoor", code: "Gd", color: "#5fe08a" },
  dice: { label: "Dice", code: "Di", color: "#ff8da1" },
  "welcome to the jungle": { label: "Welcome to the Jungle", code: "WJ", color: "#ffb340" },
  jobgether: { label: "Jobgether", code: "Jg", color: "#bf83ff" },
};

/** Resolve the display label, monogram, and accent color for a job's source. */
export function sourceMeta(source: Source, sourceLabel?: string | null): SourceMeta {
  if (sourceLabel) {
    const known = PUBLISHERS[sourceLabel.trim().toLowerCase()];
    if (known) return known;
    const cleaned = sourceLabel.trim();
    return {
      label: cleaned,
      code: cleaned.slice(0, 2),
      color: SOURCES[source].color,
    };
  }
  return SOURCES[source];
}
