import { describe, expect, it } from "vitest";
import {
  isLeadDescription,
  relativeTime,
  snippet,
  stripHtml,
} from "@/lib/format";

describe("stripHtml", () => {
  it("removes tags and collapses whitespace", () => {
    expect(stripHtml("<p>Hello   <strong>world</strong></p>")).toBe(
      "Hello world",
    );
  });

  it("decodes common entities", () => {
    expect(stripHtml("Fish &amp; chips &lt;3")).toBe("Fish & chips <3");
  });
});

describe("snippet", () => {
  it("returns short text untouched", () => {
    expect(snippet("<p>Short one</p>", 220)).toBe("Short one");
  });

  it("truncates on a word boundary with an ellipsis", () => {
    const out = snippet("<p>alpha beta gamma delta</p>", 12);
    expect(out).toBe("alpha beta…");
    expect(out.length).toBeLessThanOrEqual(13);
  });
});

describe("relativeTime", () => {
  it("renders a human distance with suffix", () => {
    const oneHourAgo = new Date(Date.now() - 3600_000);
    expect(relativeTime(oneHourAgo)).toMatch(/hour ago$/);
  });
});

describe("isLeadDescription", () => {
  it("flags near-empty email-alert descriptions as leads", () => {
    expect(isLeadDescription("<p>See posting</p>")).toBe(true);
  });

  it("treats full descriptions as complete", () => {
    expect(isLeadDescription(`<p>${"role details ".repeat(30)}</p>`)).toBe(
      false,
    );
  });
});
