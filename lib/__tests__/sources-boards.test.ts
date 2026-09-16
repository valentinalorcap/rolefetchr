import { Source } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jobicySource } from "@/lib/sources/jobicy";
import { workingNomadsSource } from "@/lib/sources/workingnomads";
import { jobspressoSource } from "@/lib/sources/jobspresso";
import { noDeskSource, parseJobPage, splitTitle } from "@/lib/sources/nodesk";
import { euRemoteJobsSource } from "@/lib/sources/euremotejobs";
import { extractBody, landingJobsSource } from "@/lib/sources/landingjobs";

type Reply = { status?: number; json?: unknown; text?: string };

/** Stub fetch with per-URL replies (substring match); unknown URLs get a 404. */
function mockFetchByUrl(routes: Array<[match: string, reply: Reply]>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const hit = routes.find(([m]) => url.includes(m));
      const status = hit?.[1].status ?? (hit ? 200 : 404);
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => hit?.[1].json ?? {},
        text: async () => hit?.[1].text ?? "",
      };
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("jobicySource", () => {
  const job = {
    id: "150846",
    url: "https://jobicy.com/jobs/150846-software-engineer",
    jobTitle: " Software engineer ",
    companyName: "Sticker Mule",
    jobIndustry: ["Software Engineering"],
    jobType: ["Contract"],
    jobGeo: "Anywhere",
    jobLevel: "Senior",
    jobExcerpt: "short",
    jobDescription: "<p>Full posting.</p>",
    pubDate: "2026-09-16T04:40:03+00:00",
    salaryMin: "150000",
    salaryMax: "250000",
    salaryCurrency: "USD",
    salaryPeriod: "yearly",
  };

  it("queries both geo buckets and dedupes on the job id", async () => {
    const calls = mockFetchByUrl([
      ["geo=anywhere", { json: { jobs: [job] } }],
      ["geo=europe", { json: { jobs: [{ ...job, jobGeo: "Europe" }, { ...job, id: 2, jobLevel: "Any", salaryMin: "" }] } }],
    ]);

    const jobs = await jobicySource.fetchJobs();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("industry=dev");
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      source: Source.JOBICY,
      externalId: "150846",
      title: "Software engineer",
      company: "Sticker Mule",
      description: "<p>Full posting.</p>",
      location: "Anywhere", // first bucket wins
      tags: ["Contract", "Senior", "Software Engineering"],
      salary: "150,000 - 250,000 USD/yearly",
      sourceUrl: "https://jobicy.com/jobs/150846-software-engineer",
    });
    expect(jobs[0].postedAt.toISOString()).toBe("2026-09-16T04:40:03.000Z");
    expect(jobs[1]).toMatchObject({ externalId: "2", tags: ["Contract", "Software Engineering"], salary: "250,000 USD/yearly" });
  });

  it("throws when a bucket fails", async () => {
    mockFetchByUrl([["geo=anywhere", { json: { jobs: [] } }], ["geo=europe", { status: 503 }]]);
    await expect(jobicySource.fetchJobs()).rejects.toThrow("Jobicy responded 503");
  });
});

describe("workingNomadsSource", () => {
  it("keeps the Development category only and splits the tag list", async () => {
    mockFetchByUrl([
      [
        "exposed_jobs",
        {
          json: [
            {
              url: "https://www.workingnomads.com/job/go/1843261/",
              title: "Senior Backend Developer (Node.js / Nest.js)",
              description: "<p>Role.</p>",
              company_name: "Proxify",
              category_name: "Development",
              tags: "back-end,nodejs, typescript,",
              location: "CET (+/- 3 hours)",
              pub_date: "2026-09-16T10:41:34-04:00",
            },
            { url: "https://www.workingnomads.com/job/go/1/", title: "Marketer", category_name: "Marketing" },
          ],
        },
      ],
    ]);

    const jobs = await workingNomadsSource.fetchJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: Source.WORKINGNOMADS,
      externalId: "1843261",
      company: "Proxify",
      location: "CET (+/- 3 hours)",
      tags: ["back-end", "nodejs", "typescript"],
      sourceUrl: "https://www.workingnomads.com/job/go/1843261/",
    });
    expect(jobs[0].postedAt.toISOString()).toBe("2026-09-16T14:41:34.000Z");
  });

  it("returns nothing for a non-array payload", async () => {
    mockFetchByUrl([["exposed_jobs", { json: { error: "nope" } }]]);
    await expect(workingNomadsSource.fetchJobs()).resolves.toEqual([]);
  });
});

describe("jobspressoSource", () => {
  const item = (id: number, type: string, category = "Full Time") => `
    <item>
      <title>Role ${id}</title>
      <link>https://jobspresso.co/job/role-${id}/</link>
      <dc:creator><![CDATA[Acme<br>⚲&nbsp;Canada]]></dc:creator>
      <pubDate>Sat, 29 Aug 2026 02:12:12 +0000</pubDate>
      <guid isPermaLink="false">https://jobspresso.co/?post_type=job_listing&#038;p=${id}</guid>
      <description><![CDATA[Excerpt]]></description>
      <content:encoded><![CDATA[<p>Full body ${id}</p>]]></content:encoded>
      <job_listing:company><![CDATA[Acme]]></job_listing:company>
      <job_listing:location><![CDATA[United States, Canada]]></job_listing:location>
      <job_listing:job_category><![CDATA[${category}]]></job_listing:job_category>
      <job_listing:job_type><![CDATA[${type}]]></job_listing:job_type>
    </item>`;
  const feed = (items: string) =>
    `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:job_listing="https://jobspresso.co"><channel>${items}</channel></rss>`;

  it("pages the feed, keeps engineering roles and tags the engagement type", async () => {
    const calls = mockFetchByUrl([
      ["paged=1", { text: feed(item(1, "Engineer", "Contract") + item(2, "Sales")) }],
      ["paged=2", { text: feed(item(3, "AI &amp; Data, Engineer")) }],
      ["paged=3", { text: feed("") }],
    ]);

    const jobs = await jobspressoSource.fetchJobs();
    expect(calls).toHaveLength(3);
    expect(jobs.map((j) => j.externalId)).toEqual(["1", "3"]);
    expect(jobs[0]).toMatchObject({
      source: Source.JOBSPRESSO,
      title: "Role 1",
      company: "Acme",
      description: "<p>Full body 1</p>",
      location: "United States, Canada",
      tags: ["Contract", "Engineer"],
      sourceUrl: "https://jobspresso.co/job/role-1/",
    });
    expect(jobs[1].tags).toEqual(["Full Time", "AI & Data", "Engineer"]);
    expect(jobs[0].postedAt.toISOString()).toBe("2026-08-29T02:12:12.000Z");
  });

  it("stops quietly on a 404 past the last page but fails on the first page", async () => {
    mockFetchByUrl([["paged=1", { text: feed(item(1, "Engineer")) }], ["paged=2", { status: 404 }]]);
    await expect(jobspressoSource.fetchJobs()).resolves.toHaveLength(1);

    mockFetchByUrl([["paged=1", { status: 500 }]]);
    await expect(jobspressoSource.fetchJobs()).rejects.toThrow("Jobspresso responded 500");
  });
});

describe("noDeskSource", () => {
  const page = (body: string) =>
    `<html><body><main class="ph5" data-job-title="X" data-job-company=Nearform data-job-tags="Remote Work, Engineering, Python, Tech Lead" data-job-employment-type=Full-Time data-job-region="North America"><section><div class=grey-800>${body}</div><div class="mt9 mt9-ns"><a class="js-apply-btn">Apply</a></div></section></main></body></html>`;
  const feed = (items: string) =>
    `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
  const item = (slug: string, title: string) =>
    `<item><title>${title}</title><description>Excerpt for ${slug}</description><pubDate>Mon, 14 Sep 2026 08:00:00 +0200</pubDate><guid>https://nodesk.co/remote-jobs/${slug}/</guid><link>https://nodesk.co/remote-jobs/${slug}/</link></item>`;

  it("splits 'Role at Company' titles", () => {
    expect(splitTitle("Tech Lead - Python at Nearform")).toEqual({ role: "Tech Lead - Python", company: "Nearform" });
    expect(splitTitle("Engineer at Company at Large")).toEqual({ role: "Engineer at Company", company: "Large" });
    expect(splitTitle("Just a title")).toEqual({ role: "Just a title", company: "Unknown" });
  });

  it("parses the job page's description and data attributes (quoted or bare)", () => {
    expect(parseJobPage(page("<p>Body</p>"))).toEqual({
      description: "<p>Body</p>",
      employmentType: "Full-Time",
      region: "North America",
      tags: ["Engineering", "Python", "Tech Lead"],
    });
    expect(parseJobPage("<main></main>")).toEqual({ description: null, employmentType: null, region: null, tags: [] });
  });

  it("merges both feeds, enriches from the job page, and falls back to the excerpt when the page fails", async () => {
    mockFetchByUrl([
      ["remote-jobs/index.xml", { text: feed(item("nearform-tech-lead", "Tech Lead - Python at Nearform") + item("b12-partners", "Web Design Partners at B12")) }],
      ["engineering/index.xml", { text: feed(item("nearform-tech-lead", "Tech Lead - Python at Nearform")) }],
      ["remote-jobs/nearform-tech-lead/", { text: page("<p>Full posting</p>") }],
    ]);

    const jobs = await noDeskSource.fetchJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      source: Source.NODESK,
      externalId: "https://nodesk.co/remote-jobs/nearform-tech-lead/",
      title: "Tech Lead - Python",
      company: "Nearform",
      description: "<p>Full posting</p>",
      location: "North America",
      tags: ["Full-Time", "Engineering", "Python", "Tech Lead"],
      descriptionUnverified: false,
    });
    expect(jobs[0].postedAt.toISOString()).toBe("2026-09-14T06:00:00.000Z");
    expect(jobs[1]).toMatchObject({
      title: "Web Design Partners",
      company: "B12",
      description: "Excerpt for b12-partners",
      location: null,
      tags: [],
      descriptionUnverified: true,
    });
  });

  it("throws when a feed is unavailable", async () => {
    mockFetchByUrl([["remote-jobs/index.xml", { status: 500 }], ["engineering/index.xml", { text: feed("") }]]);
    await expect(noDeskSource.fetchJobs()).rejects.toThrow("NoDesk feed failed");
  });
});

describe("euRemoteJobsSource", () => {
  const item = (id: number, category: string, type = "Full Time") => `
    <item>
      <title>Role ${id}</title>
      <link>https://euremotejobs.com/job/role-${id}/</link>
      <dc:creator><![CDATA[nhalabuda]]></dc:creator>
      <pubDate>Wed, 16 Sep 2026 12:28:12 +0000</pubDate>
      <guid isPermaLink="false">https://euremotejobs.com/?post_type=job_listing&#038;p=${id}</guid>
      <description><![CDATA[Excerpt]]></description>
      <content:encoded><![CDATA[<p>Full body ${id}</p>]]></content:encoded>
      <job_listing:company><![CDATA[Lemon.io]]></job_listing:company>
      <job_listing:location><![CDATA[Europe, LATAM, APAC]]></job_listing:location>
      <job_listing:salary><![CDATA[$83,000 - $130,000 USD per year]]></job_listing:salary>
      <job_listing:job_category><![CDATA[${category}]]></job_listing:job_category>
      <job_listing:job_type><![CDATA[${type}]]></job_listing:job_type>
    </item>`;
  const feed = (items: string) =>
    `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:job_listing="https://euremotejobs.com"><channel>${items}</channel></rss>`;

  it("keeps technical categories only and uses the board's company, not the poster", async () => {
    const calls = mockFetchByUrl([
      ["euremotejobs.com/?feed=job_feed", { text: feed(item(1, "Data, Engineering", "Freelance, Part Time") + item(2, "Sales") + item(3, "Admin &amp; Operations, IT")) }],
    ]);

    const jobs = await euRemoteJobsSource.fetchJobs();
    expect(calls[0]).toContain("posts_per_page=100");
    expect(jobs.map((j) => j.externalId)).toEqual(["1", "3"]);
    expect(jobs[0]).toMatchObject({
      source: Source.EUREMOTEJOBS,
      title: "Role 1",
      company: "Lemon.io",
      description: "<p>Full body 1</p>",
      location: "Europe, LATAM, APAC",
      salary: "$83,000 - $130,000 USD per year",
      tags: ["Freelance", "Part Time", "Data", "Engineering"],
      sourceUrl: "https://euremotejobs.com/job/role-1/",
    });
    expect(jobs[1].tags).toEqual(["Full Time", "Admin & Operations", "IT"]);
  });

  it("throws on a non-OK response", async () => {
    mockFetchByUrl([["euremotejobs.com", { status: 503 }]]);
    await expect(euRemoteJobsSource.fetchJobs()).rejects.toThrow("EU Remote Jobs responded 503");
  });
});

describe("landingJobsSource", () => {
  const entry = (slug: string, policy: string, jobType: string, city = "Lisbon", country = "Portugal") => `
    <entry>
      <id>https://landing.jobs/at/acme/${slug}</id>
      <published>2026-09-10T14:12:54Z</published>
      <updated>2026-09-10T14:12:54Z</updated>
      <link rel="alternate" type="text/html" href="https://landing.jobs/at/acme/${slug}?utm_source=rss"/>
      <title>Backend Developer</title>
      <content type="html"><![CDATA[<img class="logo" src="https://x/logo.png" /><div class="offer-info">At Acme (${jobType}), in ${city}<br />Remote policy: ${policy}</div><div class="role-description"><div><strong>Backend Developer</strong></div><div>Build things.</div></div>]]></content>
      <author><name>Acme</name></author>
      <lj:city>${city}</lj:city>
      <lj:country>${country}</lj:country>
      <lj:salary>€70.000 - €78.000</lj:salary>
      <lj:job_type>${jobType}</lj:job_type>
      <lj:category>Back-end Developer</lj:category>
      <lj:expires_at>2027-05-12</lj:expires_at>
      <lj:location_type>${policy}</lj:location_type>
      <lj:remote_policy>${policy}</lj:remote_policy>
    </entry>`;
  const feed = (entries: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><feed xml:lang="en-US" xmlns="http://www.w3.org/2005/Atom"><id>https://landing.jobs/</id><title>Jobs</title>${entries}</feed>`;

  it("reads Atom entries, keeps fully-remote postings only and splits the engagement", async () => {
    mockFetchByUrl([
      [
        "landing.jobs/feed",
        {
          text: feed(
            entry("remote-dev", "Full remote", "Permanent / Contractor", "false", "") +
              entry("hybrid-dev", "Partial remote", "Permanent") +
              entry("global-dev", "Global remote", "Contractor", "Portugal", "Portugal"),
          ),
        },
      ],
    ]);

    const jobs = await landingJobsSource.fetchJobs();
    expect(jobs.map((j) => j.externalId)).toEqual([
      "https://landing.jobs/at/acme/remote-dev",
      "https://landing.jobs/at/acme/global-dev",
    ]);
    expect(jobs[0]).toMatchObject({
      source: Source.LANDINGJOBS,
      title: "Backend Developer",
      company: "Acme",
      description: "<div><strong>Backend Developer</strong></div><div>Build things.</div>",
      location: "Remote",
      salary: "€70.000 - €78.000",
      tags: ["Permanent", "Contractor", "Back-end Developer", "Full remote"],
      sourceUrl: "https://landing.jobs/at/acme/remote-dev",
    });
    expect(jobs[0].postedAt.toISOString()).toBe("2026-09-10T14:12:54.000Z");
    expect(jobs[1]).toMatchObject({ location: "Portugal (Remote)", tags: ["Contractor", "Back-end Developer", "Global remote"] });
  });

  it("strips the logo and offer-info wrapper when there is no role-description block", () => {
    expect(extractBody('<img class="logo" src="x" /><div class="offer-info">At Acme<br />x</div><p>Body</p>')).toBe("<p>Body</p>");
  });

  it("returns nothing for an RSS-shaped payload and throws on a non-OK response", async () => {
    mockFetchByUrl([["landing.jobs/feed", { text: "<rss><channel><item><title>x</title></item></channel></rss>" }]]);
    await expect(landingJobsSource.fetchJobs()).resolves.toEqual([]);

    mockFetchByUrl([["landing.jobs/feed", { status: 500 }]]);
    await expect(landingJobsSource.fetchJobs()).rejects.toThrow("Landing.jobs responded 500");
  });
});
