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
    // Both live under AND as independent OR groups, so they compose.
    expect(where.AND).toHaveLength(2);
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

  it("universal search matches every text/facet column", () => {
    const where = buildWhere(filters({ keyword: "React" }));
    const or = (where.AND as Array<{ OR: unknown[] }>)[0].OR;
    expect(or).toEqual([
      { title: { contains: "React", mode: "insensitive" } },
      { company: { contains: "React", mode: "insensitive" } },
      { location: { contains: "React", mode: "insensitive" } },
      { region: { contains: "React", mode: "insensitive" } },
      { country: { contains: "React", mode: "insensitive" } },
      { techs: { has: "react" } },
      { tags: { has: "react" } },
    ]);
  });

  it("expands Spanish country synonyms in the search", () => {
    const where = buildWhere(filters({ keyword: "alemania" }));
    const or = (where.AND as Array<{ OR: unknown[] }>)[0].OR;
    // Both "alemania" and "germany" are searched → 7 clauses per term.
    expect(or).toHaveLength(14);
    expect(or).toContainEqual({ country: { contains: "germany", mode: "insensitive" } });
  });
});

describe("buildWhere — drawer facets", () => {
  it("filters companies by normalized key", () => {
    const where = buildWhere(filters({ company: "huzzle,northwind labs" }));
    expect(where.companyKey).toEqual({ in: ["huzzle", "northwind labs"] });
  });

  it("filters techs with hasSome", () => {
    const where = buildWhere(filters({ tech: "react,node" }));
    expect(where.techs).toEqual({ hasSome: ["react", "node"] });
  });

  it("ORs regions and countries into one location clause", () => {
    const where = buildWhere(filters({ region: "Europe", country: "Chile" }));
    expect(where.AND).toContainEqual({
      OR: [{ region: { in: ["Europe"] } }, { country: { in: ["Chile"] } }],
    });
  });

  it('maps the "Unspecified" region to region IS NULL', () => {
    const where = buildWhere(filters({ region: "Unspecified" }));
    expect(where.AND).toContainEqual({ OR: [{ region: null }] });
  });

  it("composes facets with tag buckets and search", () => {
    const where = buildWhere(
      filters({ status: "SAVED", region: "Europe", keyword: "react", tech: "node" }),
    );
    expect(where.techs).toEqual({ hasSome: ["node"] });
    expect(where.AND).toHaveLength(3); // buckets + location + search
  });
});
