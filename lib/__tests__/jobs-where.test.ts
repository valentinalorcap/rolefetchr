import { ActionStatus, Source } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildWhere, parseJobFilters } from "@/lib/jobs";

// Filters for a given query string, with the score floor disabled by default so
// tests can focus on one clause at a time.
const filters = (params: Record<string, string> = {}) =>
  parseJobFilters({ minScore: "0", ...params });

describe("buildWhere — tag buckets", () => {
  it("applies no action clause when every bucket is selected", () => {
    const where = buildWhere(filters());
    expect(where.AND).toBeUndefined();
    expect(where.action).toBeUndefined();
  });

  it("filters a single bucket through an OR under AND", () => {
    const where = buildWhere(filters({ status: "SAVED" }));
    expect(where.AND).toEqual([
      { OR: [{ action: { is: { status: { in: [ActionStatus.SAVED] } } } }] },
    ]);
  });

  it("matches jobs with no action row for the Untagged bucket", () => {
    const where = buildWhere(filters({ status: "NONE" }));
    expect(where.AND).toEqual([{ OR: [{ action: { is: null } }] }]);
  });

  it("combines Untagged with real statuses", () => {
    const where = buildWhere(filters({ status: "NONE,SAVED" }));
    expect(where.AND).toEqual([
      {
        OR: [
          { action: { is: null } },
          { action: { is: { status: { in: [ActionStatus.SAVED] } } } },
        ],
      },
    ]);
  });

  it("expands Applied to the whole post-application pipeline", () => {
    const where = buildWhere(filters({ status: "APPLIED" }));
    expect(where.AND).toEqual([
      {
        OR: [
          {
            action: {
              is: {
                status: {
                  in: [
                    ActionStatus.APPLIED,
                    ActionStatus.INTERVIEW,
                    ActionStatus.REJECTED,
                  ],
                },
              },
            },
          },
        ],
      },
    ]);
  });

  it("keeps the keyword OR separate from the bucket OR", () => {
    const where = buildWhere(filters({ status: "SAVED", keyword: "react" }));
    // Keyword owns the top-level OR (title/company/tags)…
    expect(where.OR).toHaveLength(3);
    // …while the bucket filter lives under AND, so both apply.
    expect(where.AND).toHaveLength(1);
  });
});

describe("buildWhere — score clauses", () => {
  it("filters by the score floor through the relation", () => {
    const where = buildWhere(filters({ minScore: "50" }));
    expect(where.score).toEqual({ is: { score: { gte: 50 } } });
  });

  it("filters eligibility through the score relation", () => {
    const where = buildWhere(filters({ eligible: "false" }));
    expect(where.score).toEqual({ is: { eligible: false } });
  });

  it("excludes unscored jobs from match sorts on the unfiltered view", () => {
    const where = buildWhere(filters());
    expect(where.score).toEqual({ isNot: null });
  });

  it("keeps unscored jobs visible on tag-filtered views", () => {
    const where = buildWhere(filters({ status: "SAVED" }));
    expect(where.score).toBeUndefined();
  });

  it("does not constrain score on non-match sorts", () => {
    const where = buildWhere(filters({ sort: "ingested" }));
    expect(where.score).toBeUndefined();
  });
});

describe("buildWhere — sources and keyword", () => {
  it("filters by source", () => {
    const where = buildWhere(filters({ source: "REMOTEOK" }));
    expect(where.source).toEqual({ in: [Source.REMOTEOK] });
  });

  it("searches title, company, and tags (tags lowercased)", () => {
    const where = buildWhere(filters({ keyword: "React" }));
    expect(where.OR).toEqual([
      { title: { contains: "React", mode: "insensitive" } },
      { company: { contains: "React", mode: "insensitive" } },
      { tags: { has: "react" } },
    ]);
  });
});
