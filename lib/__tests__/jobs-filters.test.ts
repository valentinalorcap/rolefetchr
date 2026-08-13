import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_SCORE,
  PAGE_SIZE,
  parseJobFilters,
  STATUS_KEYS,
} from "@/lib/jobs";

describe("parseJobFilters", () => {
  it("returns sensible defaults for an empty query", () => {
    const f = parseJobFilters({});
    expect(f.minScore).toBe(DEFAULT_MIN_SCORE);
    expect(f.statuses).toEqual([...STATUS_KEYS]);
    expect(f.sort).toBe("score");
    expect(f.take).toBe(PAGE_SIZE);
    expect(f.sources).toEqual([]);
    expect(f.keyword).toBeNull();
    expect(f.eligible).toBeNull();
    expect(f.fresh).toBeNull();
  });

  describe("status (tag buckets)", () => {
    it("parses a single bucket", () => {
      expect(parseJobFilters({ status: "SAVED" }).statuses).toEqual(["SAVED"]);
    });

    it("parses a comma-separated list, normalized to canonical order", () => {
      expect(parseJobFilters({ status: "APPLIED,NONE" }).statuses).toEqual([
        "NONE",
        "APPLIED",
      ]);
    });

    it("is case-insensitive and trims entries", () => {
      expect(parseJobFilters({ status: " saved , none " }).statuses).toEqual([
        "NONE",
        "SAVED",
      ]);
    });

    it("drops unknown values, keeping the valid ones", () => {
      expect(parseJobFilters({ status: "FOO,SAVED" }).statuses).toEqual([
        "SAVED",
      ]);
    });

    it("falls back to all buckets when nothing in the list is valid", () => {
      expect(parseJobFilters({ status: "FOO" }).statuses).toEqual([
        ...STATUS_KEYS,
      ]);
      expect(parseJobFilters({ status: "" }).statuses).toEqual([...STATUS_KEYS]);
    });

    it("dedupes repeated values", () => {
      expect(parseJobFilters({ status: "SAVED,SAVED" }).statuses).toEqual([
        "SAVED",
      ]);
    });
  });

  describe("minScore", () => {
    it("applies the default floor when absent", () => {
      expect(parseJobFilters({}).minScore).toBe(DEFAULT_MIN_SCORE);
    });

    it('treats "0" and empty as "show everything" (null)', () => {
      expect(parseJobFilters({ minScore: "0" }).minScore).toBeNull();
      expect(parseJobFilters({ minScore: "" }).minScore).toBeNull();
    });

    it("parses an explicit floor", () => {
      expect(parseJobFilters({ minScore: "50" }).minScore).toBe(50);
    });

    it("ignores garbage", () => {
      expect(parseJobFilters({ minScore: "abc" }).minScore).toBeNull();
    });
  });

  describe("sources", () => {
    it("parses and uppercases valid sources", () => {
      expect(parseJobFilters({ source: "remoteok" }).sources).toEqual([
        "REMOTEOK",
      ]);
    });

    it("drops unknown sources", () => {
      expect(parseJobFilters({ source: "BOGUS" }).sources).toEqual([]);
    });
  });

  describe("misc params", () => {
    it("falls back to score sort on unknown sort keys", () => {
      expect(parseJobFilters({ sort: "banana" }).sort).toBe("score");
      expect(parseJobFilters({ sort: "posted" }).sort).toBe("posted");
    });

    it("rejects non-positive take values", () => {
      expect(parseJobFilters({ take: "-5" }).take).toBe(PAGE_SIZE);
      expect(parseJobFilters({ take: "10" }).take).toBe(10);
    });

    it("trims the keyword and nulls it when empty", () => {
      expect(parseJobFilters({ keyword: "  react  " }).keyword).toBe("react");
      expect(parseJobFilters({ keyword: "   " }).keyword).toBeNull();
    });

    it("parses eligible as a tri-state", () => {
      expect(parseJobFilters({ eligible: "true" }).eligible).toBe(true);
      expect(parseJobFilters({ eligible: "false" }).eligible).toBe(false);
      expect(parseJobFilters({ eligible: "yes" }).eligible).toBeNull();
    });

    it("validates freshness windows", () => {
      expect(parseJobFilters({ fresh: "24h" }).fresh).toBe("24h");
      expect(parseJobFilters({ fresh: "1w" }).fresh).toBeNull();
    });

    it("takes the first value when a param is repeated", () => {
      expect(parseJobFilters({ status: ["SAVED", "APPLIED"] }).statuses).toEqual(
        ["SAVED"],
      );
    });
  });
});
