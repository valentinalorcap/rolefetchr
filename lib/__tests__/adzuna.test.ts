import { Source } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adzunaSource, buildUrl } from "@/lib/sources/adzuna";

const queries: unknown[] = [];
vi.mock("@/lib/source-queries", () => ({
  getAdzunaQueries: async () => queries,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  queries.length = 0;
});

const job = {
  id: 129698749,
  title: " Javascript Developer ",
  description: "Remote-first team. Snippet of the ad ...",
  redirect_url: "https://www.adzuna.example/jobs/land/ad/129698749",
  created: "2026-09-10T18:07:39Z",
  company: { display_name: "Corporate Project Solutions" },
  location: { display_name: "Marlow, Buckinghamshire", area: ["UK", "South East England"] },
  category: { label: "IT Jobs" },
  salary_min: 45000,
  salary_max: 55000,
  salary_is_predicted: "0",
  contract_type: "contract",
  contract_time: "full_time",
};

describe("adzunaSource", () => {
  it("builds the per-country URL with the configured filters", () => {
    const url = buildUrl({ query: "remote software engineer", country: "gb", where: "London", contractOnly: true }, "id", "key");
    expect(url.startsWith("https://api.adzuna.com/v1/api/jobs/gb/search/1?")).toBe(true);
    expect(url).toContain("what=remote+software+engineer");
    expect(url).toContain("where=London");
    expect(url).toContain("contract=1");
    expect(url).toContain("app_id=id");
    expect(url).toContain("app_key=key");
    expect(buildUrl({ query: "x", country: "de", contractOnly: false }, "id", "key")).not.toContain("contract=");
  });

  it("stays idle with no configured queries, and skips without credentials", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(adzunaSource.fetchJobs()).resolves.toEqual([]);

    queries.push({ query: "remote software engineer", country: "gb", contractOnly: true });
    vi.stubEnv("ADZUNA_APP_ID", "");
    vi.stubEnv("ADZUNA_APP_KEY", "");
    await expect(adzunaSource.fetchJobs()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes results as unverified snippets, tags the contract type and detects remote wording", async () => {
    queries.push(
      { query: "remote software engineer", country: "gb", contractOnly: true },
      { query: "front end developer", country: "gb", contractOnly: false },
    );
    vi.stubEnv("ADZUNA_APP_ID", "id");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("what=remote")) return { ok: true, status: 200, json: async () => ({ results: [job] }) };
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [
              job, // duplicate across queries
              { ...job, id: "2", description: "On-site role", contract_type: "permanent", contract_time: "part_time", salary_is_predicted: "1", category: {} },
              { id: "3", title: "No link" },
            ],
          }),
        };
      }),
    );

    const jobs = await adzunaSource.fetchJobs();
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      source: Source.ADZUNA,
      externalId: "129698749",
      title: "Javascript Developer",
      company: "Corporate Project Solutions",
      location: "Marlow, Buckinghamshire",
      remote: true,
      salary: "45,000 - 55,000",
      tags: ["Contract", "Full-time", "IT Jobs"],
      sourceUrl: "https://www.adzuna.example/jobs/land/ad/129698749",
      descriptionUnverified: true,
    });
    expect(jobs[0].postedAt.toISOString()).toBe("2026-09-10T18:07:39.000Z");
    expect(jobs[1]).toMatchObject({ externalId: "2", remote: false, salary: null, tags: ["Permanent", "Part-time"] });
  });

  it("lets one failing query not sink the others", async () => {
    queries.push({ query: "a", country: "gb", contractOnly: false }, { query: "b", country: "xx", contractOnly: false });
    vi.stubEnv("ADZUNA_APP_ID", "id");
    vi.stubEnv("ADZUNA_APP_KEY", "key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/jobs/xx/") ? { ok: false, status: 400, json: async () => ({}) } : { ok: true, status: 200, json: async () => ({ results: [job] }) },
      ),
    );
    await expect(adzunaSource.fetchJobs()).resolves.toHaveLength(1);
  });
});
