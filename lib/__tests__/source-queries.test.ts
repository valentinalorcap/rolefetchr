import { describe, expect, it, vi } from "vitest";

const config: { sourceQueries: unknown } = { sourceQueries: null };
vi.mock("@/lib/cv-context", () => ({ getScoringConfig: async () => config }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  DEFAULT_JSEARCH_QUERIES,
  getAdzunaQueries,
  getJsearchQueries,
  sourceQueriesSchema,
} from "@/lib/source-queries";

describe("source queries", () => {
  it("falls back to the generic defaults when nothing is configured", async () => {
    config.sourceQueries = null;
    expect(await getJsearchQueries()).toEqual(DEFAULT_JSEARCH_QUERIES);
  });

  it("returns the configured queries with defaults filled in", async () => {
    config.sourceQueries = {
      jsearch: [{ query: "react developer contract Dublin", remoteOnly: false, country: "IE" }],
    };
    expect(await getJsearchQueries()).toEqual([
      { query: "react developer contract Dublin", remoteOnly: false, country: "ie" },
    ]);
  });

  it("ignores a malformed stored value and uses the defaults", async () => {
    config.sourceQueries = { jsearch: [{ query: "" }] };
    expect(await getJsearchQueries()).toEqual(DEFAULT_JSEARCH_QUERIES);
  });

  it("has no Adzuna defaults: idle until configured, then normalized", async () => {
    config.sourceQueries = null;
    expect(await getAdzunaQueries()).toEqual([]);
    config.sourceQueries = { adzuna: [{ query: "remote software engineer", country: "GB", contractOnly: true }] };
    expect(await getAdzunaQueries()).toEqual([
      { query: "remote software engineer", country: "gb", contractOnly: true },
    ]);
    expect(sourceQueriesSchema.safeParse({ adzuna: [{ query: "x" }] }).success).toBe(false);
  });

  it("rejects bad country codes and empty lists in the schema", () => {
    expect(sourceQueriesSchema.safeParse({ jsearch: [{ query: "x", country: "aus" }] }).success).toBe(false);
    expect(sourceQueriesSchema.safeParse({ jsearch: [] }).success).toBe(false);
  });
});
