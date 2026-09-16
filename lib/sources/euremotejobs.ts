import { Source } from "@prisma/client";
import type { JobSource, NormalizedJob } from "./types";
import { parseWpJobFeed, wpBody, wpList, wpPostId, wpText, type WpJobItem } from "./wp-job-feed";

// EU Remote Jobs — WP Job Manager feed of remote roles open to EMEA time
// zones. `paged=N` returns nothing past page 1, but `posts_per_page` is
// honored, so one request covers the recent window. job_listing:job_category
// is the discipline ("Engineering", "Data, Engineering", "Sales", ...) and
// job_listing:job_type the engagement ("Full Time", "Freelance", ...).
const FEED_URL = "https://euremotejobs.com/?feed=job_feed&posts_per_page=100";
const USER_AGENT =
  "rolefetchr/1.0 (+https://github.com/valentinalorcap/rolefetchr)";

// Technical disciplines; the global title gate in ingest narrows further.
const TECH_CATEGORY = /\b(engineering|development|developer|it)\b/i;

function isTechnical(item: WpJobItem): boolean {
  return wpList(item["job_listing:job_category"]).some((c) => TECH_CATEGORY.test(c));
}

export const euRemoteJobsSource: JobSource = {
  source: Source.EUREMOTEJOBS,
  async fetchJobs(): Promise<NormalizedJob[]> {
    const res = await fetch(FEED_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`EU Remote Jobs responded ${res.status}`);

    const byId = new Map<string, NormalizedJob>();
    for (const it of parseWpJobFeed(await res.text())) {
      const id = wpPostId(it);
      if (!id || !it.title || !isTechnical(it) || byId.has(id)) continue;
      byId.set(id, {
        source: Source.EUREMOTEJOBS,
        externalId: id,
        title: wpText(it.title),
        // dc:creator is the poster's username here, not the employer.
        company: wpText(it["job_listing:company"]) || "Unknown",
        description: wpBody(it),
        location: wpText(it["job_listing:location"]) || null,
        remote: true,
        salary: wpText(it["job_listing:salary"]) || null,
        tags: [...wpList(it["job_listing:job_type"]), ...wpList(it["job_listing:job_category"])],
        sourceUrl: wpText(it.link) || wpText(it.guid),
        postedAt: it.pubDate ? new Date(it.pubDate) : new Date(),
      });
    }

    return [...byId.values()];
  },
};
