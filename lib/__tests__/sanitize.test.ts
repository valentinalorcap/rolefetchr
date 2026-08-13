import { describe, expect, it } from "vitest";
import { sanitizeDescription } from "@/lib/sanitize";

describe("sanitizeDescription", () => {
  it("strips script tags and event handlers (XSS)", () => {
    const out = sanitizeDescription(
      '<p onclick="steal()">Hi</p><script>alert(1)</script>',
    );
    expect(out).toBe("<p>Hi</p>");
  });

  it("drops javascript: URLs from links", () => {
    const out = sanitizeDescription('<p><a href="javascript:alert(1)">x</a></p>');
    expect(out).not.toContain("javascript:");
  });

  it("keeps https links and hardens them for a new tab", () => {
    const out = sanitizeDescription('<p><a href="https://a.example">apply</a></p>');
    expect(out).toContain('href="https://a.example"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it("demotes h1/h2 below the page's own job title", () => {
    expect(sanitizeDescription("<h1>About</h1>")).toBe("<h3>About</h3>");
    expect(sanitizeDescription("<h2>Perks</h2>")).toBe("<h3>Perks</h3>");
  });

  it("drops the empty paragraphs boards love to emit", () => {
    expect(sanitizeDescription("<p></p><p>Real</p><p> </p>")).toBe(
      "<p>Real</p>",
    );
  });

  it("rebuilds paragraphs and line breaks from plain-text descriptions", () => {
    const out = sanitizeDescription("First block\nsame para\n\nSecond block");
    expect(out).toBe("<p>First block<br />same para</p><p>Second block</p>");
  });

  it("escapes HTML-looking text inside plain-text descriptions", () => {
    const out = sanitizeDescription("5 > 3 and <script> is not code here");
    expect(out).not.toContain("<script>");
  });
});
