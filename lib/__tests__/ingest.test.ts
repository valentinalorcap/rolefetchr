import { Source } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { JobSource } from "@/lib/sources";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ingestionRun: { create: async () => ({ id: "run" }), update: async () => ({}) },
    job: { findMany: async () => [], updateMany: async () => ({}), createMany: async () => ({ count: 0 }) },
  },
}));
vi.mock("@/lib/muted-sources", () => ({ getMutedKeys: async () => new Set<string>() }));

const state = { running: 0, peak: 0 };
const names = [Source.REMOTEOK, Source.REMOTIVE, Source.HIMALAYAS, Source.JSEARCH, Source.GETONBOARD, Source.JOBICY, Source.ADZUNA];
vi.mock("@/lib/sources", () => ({
  sources: names.map(
    (source): JobSource => ({
      source,
      async fetchJobs() {
        state.peak = Math.max(state.peak, ++state.running);
        await new Promise((r) => setTimeout(r, source === Source.JSEARCH ? 30 : 5));
        state.running--;
        if (source === Source.JOBICY) throw new Error("feed down");
        return [];
      },
    }),
  ),
}));

const { ingestAll, selectSources } = await import("@/lib/ingest");

const registry = names.map((source): JobSource => ({ source, fetchJobs: async () => [] }));

describe("selectSources", () => {
  it("returns every source when nothing is selected", () => {
    expect(selectSources(registry).map((s) => s.source)).toEqual(names);
  });

  it("applies only and except", () => {
    expect(selectSources(registry, { only: ["JSEARCH"] }).map((s) => s.source)).toEqual([Source.JSEARCH]);
    expect(selectSources(registry, { except: ["JSEARCH"] }).map((s) => s.source)).toEqual(
      names.filter((n) => n !== Source.JSEARCH),
    );
  });

  it("rejects a name that isn't registered", () => {
    expect(() => selectSources(registry, { only: ["NOPE"] })).toThrow("Unknown source: NOPE");
  });
});

describe("ingestAll", () => {
  it("runs sources concurrently within the cap, in registry order, isolating failures", async () => {
    const results = await ingestAll();

    expect(results.map((r) => r.source)).toEqual(names);
    expect(state.peak).toBeGreaterThan(1);
    expect(state.peak).toBeLessThanOrEqual(4);
    expect(results.find((r) => r.source === Source.JOBICY)?.error).toBe("feed down");
    expect(results.filter((r) => r.error === null)).toHaveLength(names.length - 1);
  });

  it("runs only the selected sources", async () => {
    const results = await ingestAll({ except: ["JSEARCH"] });
    expect(results.map((r) => r.source)).not.toContain(Source.JSEARCH);
    expect(results).toHaveLength(names.length - 1);
  });
});
