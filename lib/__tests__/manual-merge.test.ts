import { describe, expect, it } from "vitest";
import { mergeJobFields, type JobContentFields } from "@/lib/manual-ingest";

const REAL_DESCRIPTION =
  "<p>We are looking for a Full Stack Engineer to join our platform team. " +
  "You will own features end to end across a TypeScript stack, collaborate with " +
  "product and design, and help maintain our shared component library. " +
  "Experience with React, Node and Postgres is required.</p>";

const existing = (over: Partial<JobContentFields> = {}): JobContentFields => ({
  title: "Full Stack Engineer",
  company: "Acme",
  description: REAL_DESCRIPTION,
  location: "Remote (Europe)",
  salary: null,
  tags: ["react"],
  workMode: "REMOTE",
  ...over,
});

const input = { title: "Full Stack Engineer", company: "Acme" };

describe("mergeJobFields — description guard", () => {
  it("a placeholder never overwrites a real description", () => {
    const out = mergeJobFields(existing(), { ...input, description: "See posting." });
    expect(out.merged.description).toBe(REAL_DESCRIPTION);
    expect(out.kept).toContain("description");
    expect(out.scoreCleared).toBe(false);
  });

  it("a real description replaces an empty one and clears the score", () => {
    const out = mergeJobFields(existing({ description: "" }), {
      ...input,
      description: REAL_DESCRIPTION,
    });
    expect(out.merged.description).toBe(REAL_DESCRIPTION);
    expect(out.changed).toContain("description");
    expect(out.scoreCleared).toBe(true);
  });

  it("a real description replaces a short placeholder and clears the score", () => {
    const out = mergeJobFields(existing({ description: "Lead from email alert." }), {
      ...input,
      description: REAL_DESCRIPTION,
    });
    expect(out.scoreCleared).toBe(true);
  });

  it("a longer description wins but does not clear a score made on real content", () => {
    const out = mergeJobFields(existing(), {
      ...input,
      description: REAL_DESCRIPTION + "<p>More details about the interview process.</p>",
    });
    expect(out.changed).toContain("description");
    expect(out.scoreCleared).toBe(false);
  });

  it("omitting the description changes nothing", () => {
    const out = mergeJobFields(existing(), input);
    expect(out.merged.description).toBe(REAL_DESCRIPTION);
    expect(out.changed).not.toContain("description");
    expect(out.kept).toHaveLength(0);
  });
});

describe("mergeJobFields — salary and location fill blanks only", () => {
  it("fills a blank salary", () => {
    const out = mergeJobFields(existing(), { ...input, salary: "€50-60K" });
    expect(out.merged.salary).toBe("€50-60K");
    expect(out.changed).toContain("salary");
  });

  it("keeps an existing location over a different incoming one", () => {
    const out = mergeJobFields(existing(), { ...input, location: "Madrid" });
    expect(out.merged.location).toBe("Remote (Europe)");
    expect(out.kept).toContain("location");
  });

  it("fills a blank location", () => {
    const out = mergeJobFields(existing({ location: null }), { ...input, location: "Madrid" });
    expect(out.merged.location).toBe("Madrid");
    expect(out.changed).toContain("location");
  });
});

describe("mergeJobFields — work mode", () => {
  it("recomputes the mode when the merged location signals hybrid", () => {
    const out = mergeJobFields(existing({ location: null }), {
      ...input,
      location: "Madrid (Hybrid)",
    });
    expect(out.merged.workMode).toBe("HYBRID");
    expect(out.changed).toContain("workMode");
  });

  it("an explicit workMode wins over detection", () => {
    const out = mergeJobFields(existing(), { ...input, workMode: "ONSITE" });
    expect(out.merged.workMode).toBe("ONSITE");
  });
});
