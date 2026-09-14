import { Source } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { remoteOkSource } from "@/lib/sources/remoteok";
import { remotiveSource } from "@/lib/sources/remotive";
import { jsearchSource } from "@/lib/sources/jsearch";

// The adapter reads its queries from the DB-backed config; stub the module so
// the test runs without Prisma and exercises both a remote and a city query.
vi.mock("@/lib/source-queries", () => ({
  getJsearchQueries: async () => [
    { query: "remote typescript engineer", remoteOnly: true },
    { query: "software engineer contract Dublin", remoteOnly: false, country: "ie", employmentTypes: "CONTRACTOR" },
  ],
}));

function mockFetchJson(payload: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status, json: async () => payload })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("remoteOkSource", () => {
  const fixture = [
    { legal: "API terms notice — not a job" },
    {
      id: 123,
      slug: "fullstack-engineer-acme",
      position: "  Full Stack Engineer ",
      company: "Acme",
      description: " <p>Build things.</p> ",
      location: "Worldwide",
      tags: ["typescript", "react"],
      url: "https://remoteok.com/remote-jobs/123",
      epoch: 1754900000,
      salary_min: 60000,
      salary_max: 80000,
    },
    { id: 124, position: "Backend Developer", company: "" },
  ];

  it("normalizes entries and skips the legal/metadata element", async () => {
    mockFetchJson(fixture);
    const jobs = await remoteOkSource.fetchJobs();

    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      source: Source.REMOTEOK,
      externalId: "123",
      title: "Full Stack Engineer",
      company: "Acme",
      location: "Worldwide",
      tags: ["typescript", "react"],
      sourceUrl: "https://remoteok.com/remote-jobs/123",
      salary: "$60,000 - $80,000",
    });
    expect(jobs[0].postedAt).toEqual(new Date(1754900000 * 1000));
  });

  it("falls back to a built URL and a default company", async () => {
    mockFetchJson(fixture);
    const jobs = await remoteOkSource.fetchJobs();
    expect(jobs[1].company).toBe("Unknown");
    expect(jobs[1].sourceUrl).toBe("https://remoteok.com/remote-jobs/124");
    expect(jobs[1].salary).toBeNull();
  });

  it("throws on a non-OK response", async () => {
    mockFetchJson([], false, 503);
    await expect(remoteOkSource.fetchJobs()).rejects.toThrow(
      "RemoteOK responded 503",
    );
  });
});

describe("remotiveSource", () => {
  it("normalizes jobs and pins the timezone-less date to UTC", async () => {
    mockFetchJson({
      jobs: [
        {
          id: 42,
          url: "https://remotive.com/jobs/42",
          title: " Frontend Engineer ",
          company_name: "Northwind",
          tags: ["vue"],
          publication_date: "2026-08-01T12:00:00",
          candidate_required_location: " Europe ",
          salary: "",
          description: "<p>Ship UI.</p>",
        },
      ],
    });

    const jobs = await remotiveSource.fetchJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: Source.REMOTIVE,
      externalId: "42",
      title: "Frontend Engineer",
      company: "Northwind",
      location: "Europe",
      salary: null,
      sourceUrl: "https://remotive.com/jobs/42",
    });
    expect(jobs[0].postedAt.toISOString()).toBe("2026-08-01T12:00:00.000Z");
  });

  it("returns an empty list when the payload has no jobs array", async () => {
    mockFetchJson({});
    await expect(remotiveSource.fetchJobs()).resolves.toEqual([]);
  });
});

describe("jsearchSource", () => {
  const remoteJob = {
    job_id: "r1",
    job_title: "TypeScript Engineer",
    employer_name: "Acme",
    job_publisher: "LinkedIn",
    job_employment_type: "FULLTIME",
    job_apply_link: "https://example.com/r1",
    job_description: "Remote TS role",
    job_is_remote: true,
    job_location: "London, UK",
    job_posted_at_datetime_utc: "2026-09-10T00:00:00.000Z",
  };
  const cityJob = {
    job_id: "c1",
    job_title: "Angular Developer (Contract)",
    employer_name: "Local Co",
    job_publisher: "Indeed",
    job_employment_type: "CONTRACTOR",
    job_apply_link: "https://example.com/c1",
    job_description: "6-month contract, daily rate",
    job_is_remote: false,
    job_location: "Dublin, Ireland",
  };

  it("runs the configured queries with their params and keeps the API's remote flag", async () => {
    vi.stubEnv("JSEARCH_API_KEY", "key");
    vi.useFakeTimers();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        const city = url.includes("country=ie");
        return { ok: true, status: 200, json: async () => ({ data: city ? [cityJob] : [remoteJob] }) };
      }),
    );

    const promise = jsearchSource.fetchJobs();
    await vi.runAllTimersAsync();
    const jobs = await promise;
    vi.useRealTimers();
    vi.unstubAllEnvs();

    expect(calls).toHaveLength(2);
    const [remoteCall, cityCall] = calls;
    expect(remoteCall).toContain("remote_jobs_only=true");
    expect(remoteCall).not.toContain("country=");
    expect(cityCall).toContain("country=ie");
    expect(cityCall).toContain("employment_types=CONTRACTOR");
    expect(cityCall).not.toContain("remote_jobs_only");
    expect(decodeURIComponent(cityCall).replace(/\+/g, " ")).toContain("contract Dublin");

    expect(jobs.find((j) => j.externalId === "r1")).toMatchObject({
      location: "Remote",
      remote: true,
      tags: ["Full-time"],
      sourceLabel: "LinkedIn",
    });
    expect(jobs.find((j) => j.externalId === "c1")).toMatchObject({
      location: "Dublin, Ireland",
      remote: false,
      tags: ["Contract"],
      sourceLabel: "Indeed",
    });
  });
});
