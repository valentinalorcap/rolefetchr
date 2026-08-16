import { Source } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getOnBoardSource } from "@/lib/sources/getonboard";

const job = (over: Record<string, unknown> = {}, links = true) => ({
  id: "full-stack-developer-acme-santiago-1a2b",
  type: "job",
  attributes: {
    title: " Full Stack Developer ",
    description: "<ul><li>3+ years TypeScript</li></ul>",
    description_headline: "Requirements",
    functions: "<p>Ship features.</p>",
    functions_headline: "What you'll do",
    benefits: "<p>Remote budget.</p>",
    benefits_headline: "Benefits",
    remote: true,
    remote_modality: "fully_remote",
    countries: ["Remote"],
    min_salary: 3000,
    max_salary: 4000,
    published_at: 1755300000,
    company: { data: { attributes: { name: " Acme " } } },
    ...over,
  },
  ...(links
    ? { links: { public_url: "https://www.getonbrd.com/jobs/full-stack-developer-acme-santiago-1a2b" } }
    : {}),
});

function mockPage(data: unknown[], totalPages = 1) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data, meta: { page: 1, total_pages: totalPages } }),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getOnBoardSource", () => {
  it("normalizes a fully-remote job", async () => {
    mockPage([job()]);
    const jobs = await getOnBoardSource.fetchJobs();

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      source: Source.GETONBOARD,
      externalId: "full-stack-developer-acme-santiago-1a2b",
      title: "Full Stack Developer",
      company: "Acme",
      location: "Remote",
      remote: true,
      salary: "$3,000 - $4,000 USD/month",
      sourceUrl:
        "https://www.getonbrd.com/jobs/full-stack-developer-acme-santiago-1a2b",
    });
    expect(jobs[0].postedAt).toEqual(new Date(1755300000 * 1000));
  });

  it("stitches the HTML sections with their headlines", async () => {
    mockPage([job()]);
    const [j] = await getOnBoardSource.fetchJobs();
    expect(j.description).toBe(
      "<h3>What you'll do</h3><p>Ship features.</p>" +
        "<h3>Requirements</h3><ul><li>3+ years TypeScript</li></ul>" +
        "<h3>Benefits</h3><p>Remote budget.</p>",
    );
  });

  it("drops non-remote and residency-restricted postings", async () => {
    mockPage([
      job({ remote: false, remote_modality: "hybrid" }),
      job({ remote_modality: "remote_local", countries: ["Chile"] }),
      job(),
    ]);
    const jobs = await getOnBoardSource.fetchJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].location).toBe("Remote");
  });

  it("keeps real country names in the location", async () => {
    mockPage([job({ countries: ["Chile", "Peru"] })]);
    const [j] = await getOnBoardSource.fetchJobs();
    expect(j.location).toBe("Remote (Chile, Peru)");
  });

  it("handles missing salary, company, and link", async () => {
    mockPage([
      job({ min_salary: null, max_salary: null, company: undefined }, false),
    ]);
    const [j] = await getOnBoardSource.fetchJobs();
    expect(j.salary).toBeNull();
    expect(j.company).toBe("Unknown");
    expect(j.sourceUrl).toBe(
      "https://www.getonbrd.com/jobs/full-stack-developer-acme-santiago-1a2b",
    );
  });

  it("throws on a non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) })));
    await expect(getOnBoardSource.fetchJobs()).rejects.toThrow(
      "Get on Board responded 429",
    );
  });
});
