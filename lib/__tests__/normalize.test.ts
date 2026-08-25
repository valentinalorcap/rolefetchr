import { describe, expect, it } from "vitest";
import {
  companyKey,
  detectWorkMode,
  extractTechs,
  normalizeCountry,
  normalizeRegion,
  searchTerms,
} from "@/lib/normalize";

// Location samples straight from the live dataset (938 distinct raw values).
describe("normalizeCountry / normalizeRegion", () => {
  it.each([
    ["United States (Remote)", "United States", "North America"],
    ["Remote from: United States", "United States", "North America"],
    ["Brooklyn, NY (Remote)", "United States", "North America"],
    ["United Kingdom (Remote)", "United Kingdom", "Europe"],
    ["London, England, United Kingdom", "United Kingdom", "Europe"],
    ["Germany", "Germany", "Europe"],
    ["Amsterdam, North Holland, Netherlands", "Netherlands", "Europe"],
    ["Utrecht, Netherlands (Hybrid)", "Netherlands", "Europe"],
    ["Chile (Remote)", "Chile", "LatAm"],
    ["Santiago Metropolitan Area (Remote)", "Chile", "LatAm"],
    ["Brazil", "Brazil", "LatAm"],
    ["India", "India", "Asia & Pacific"],
    ["Madrid, Spain", "Spain", "Europe"],
  ])("%s → %s / %s", (raw, country, region) => {
    expect(normalizeCountry(raw)).toBe(country);
    expect(normalizeRegion(raw)).toBe(region);
  });

  it.each([
    ["Remote", "Worldwide"],
    ["Anywhere in the World", "Worldwide"],
    ["Remote (Work from Anywhere)", "Worldwide"],
    ["Remote (Europe)", "Europe"],
    ["EMEA", "Europe"],
    ["Remote (LatAm)", "LatAm"],
  ])("region-only text: %s → %s", (raw, region) => {
    expect(normalizeCountry(raw)).toBeNull();
    expect(normalizeRegion(raw)).toBe(region);
  });

  it("returns null for empty or unrecognizable locations", () => {
    expect(normalizeRegion(null)).toBeNull();
    expect(normalizeRegion("")).toBeNull();
    expect(normalizeCountry("Planet Mars")).toBeNull();
  });
});

describe("extractTechs", () => {
  it("detects techs across title, tags, and description", () => {
    const techs = extractTechs(
      "Senior Full Stack Engineer",
      ["typescript", "react"],
      "<p>You will build Node.js services on AWS with PostgreSQL.</p>",
    );
    expect(techs).toEqual(
      expect.arrayContaining(["typescript", "react", "node", "aws", "postgres"]),
    );
  });

  it("does not confuse java with javascript", () => {
    expect(extractTechs("Java Engineer", [], "")).toContain("java");
    expect(extractTechs("Java Engineer", [], "")).not.toContain("javascript");
    expect(extractTechs("JavaScript Developer", [], "")).toContain("javascript");
    expect(extractTechs("JavaScript Developer", [], "")).not.toContain("java");
  });

  it("distinguishes react from react native", () => {
    const t = extractTechs("React Native Engineer", [], "");
    expect(t).toContain("react native");
    expect(t).not.toContain("react");
  });

  it("returns an empty list when nothing matches", () => {
    expect(extractTechs("Marketing Manager", [], "sell things")).toEqual([]);
  });
});

describe("companyKey", () => {
  it.each([
    ["Huzzle", "Huzzle Ltd"],
    ["lemon.io", "Lemon.io"],
    ["BURGEON IT SERVICES", "BURGEON IT SERVICES LLC"],
    ["Mutual of Omaha", "Mutual Of Omaha"],
  ])("unifies real duplicate pairs: %s ↔ %s", (a, b) => {
    expect(companyKey(a)).toBe(companyKey(b));
  });

  it("keeps distinct companies distinct", () => {
    expect(companyKey("Northwind Labs")).not.toBe(companyKey("Bluefern Systems"));
  });
});

describe("detectWorkMode", () => {
  it("detects hybrid from the location text", () => {
    expect(detectWorkMode("Madrid (Hybrid)", "Software Engineer", [])).toBe("HYBRID");
    expect(detectWorkMode("Madrid, híbrido", "Software Engineer", [])).toBe("HYBRID");
  });

  it("detects hybrid and on-site from title or tags", () => {
    expect(detectWorkMode("Madrid", "Fullstack Engineer (Hybrid)", [])).toBe("HYBRID");
    expect(detectWorkMode("Madrid", "Backend Engineer", ["on-site"])).toBe("ONSITE");
    expect(detectWorkMode("Madrid, presencial", "Backend Engineer", [])).toBe("ONSITE");
  });

  it("prefers hybrid when both signals appear", () => {
    expect(
      detectWorkMode("Madrid — hybrid, 2 days on-site", "Engineer", []),
    ).toBe("HYBRID");
  });

  it("defaults to remote otherwise (descriptions are not scanned)", () => {
    expect(detectWorkMode("Remote (Worldwide)", "Software Engineer", ["react"])).toBe("REMOTE");
    expect(detectWorkMode(null, "Software Engineer", [])).toBe("REMOTE");
  });
});

describe("searchTerms (Spanish synonyms)", () => {
  it("adds the English term for known Spanish country/region names", () => {
    expect(searchTerms("alemania")).toEqual(["alemania", "germany"]);
    expect(searchTerms("Europa")).toEqual(["Europa", "europe"]);
    expect(searchTerms("países bajos")).toEqual(["países bajos", "netherlands"]);
  });

  it("passes ordinary keywords through unchanged", () => {
    expect(searchTerms("react")).toEqual(["react"]);
    expect(searchTerms("Northwind")).toEqual(["Northwind"]);
  });
});
