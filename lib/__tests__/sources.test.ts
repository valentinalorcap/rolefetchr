import { Source } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { remoteOkSource } from "@/lib/sources/remoteok";
import { remotiveSource } from "@/lib/sources/remotive";

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
