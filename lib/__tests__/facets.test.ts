import { describe, expect, it } from "vitest";
import { buildFacets, type FacetRow } from "@/lib/facets";

const row = (over: Partial<FacetRow>): FacetRow => ({
  company: "Acme",
  companyKey: "acme",
  region: "Europe",
  country: "Germany",
  techs: [],
  source: "REMOTEOK",
  ...over,
});

describe("buildFacets", () => {
  it("groups company spellings under one key with the most frequent label", () => {
    const facets = buildFacets([
      row({ company: "Huzzle", companyKey: "huzzle" }),
      row({ company: "Huzzle", companyKey: "huzzle" }),
      row({ company: "Huzzle Ltd", companyKey: "huzzle" }),
    ]);
    expect(facets.companies).toEqual([{ key: "huzzle", label: "Huzzle", count: 3 }]);
  });

  it("nests country counts under their region, in canonical region order", () => {
    const facets = buildFacets([
      row({ region: "Europe", country: "Germany" }),
      row({ region: "Europe", country: "Germany" }),
      row({ region: "Europe", country: "Netherlands" }),
      row({ region: "Worldwide", country: null }),
      row({ region: null, country: null }),
    ]);
    expect(facets.locations.map((l) => l.region)).toEqual([
      "Worldwide",
      "Europe",
      "Unspecified",
    ]);
    const europe = facets.locations.find((l) => l.region === "Europe");
    expect(europe?.count).toBe(3);
    expect(europe?.countries).toEqual([
      { name: "Germany", count: 2 },
      { name: "Netherlands", count: 1 },
    ]);
  });

  it("counts techs across jobs, most frequent first", () => {
    const facets = buildFacets([
      row({ techs: ["react", "typescript"] }),
      row({ techs: ["typescript"] }),
    ]);
    expect(facets.techs).toEqual([
      { name: "typescript", count: 2 },
      { name: "react", count: 1 },
    ]);
  });

  it("falls back to the lowercased name when companyKey is missing", () => {
    const facets = buildFacets([row({ company: "Acme", companyKey: null })]);
    expect(facets.companies[0]).toEqual({ key: "acme", label: "Acme", count: 1 });
  });

  it("counts sources, most frequent first", () => {
    const facets = buildFacets([
      row({ source: "REMOTIVE" }),
      row({ source: "REMOTIVE" }),
      row({ source: "MANUAL" }),
    ]);
    expect(facets.sources).toEqual([
      { name: "REMOTIVE", count: 2 },
      { name: "MANUAL", count: 1 },
    ]);
  });
});
