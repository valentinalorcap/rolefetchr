import { describe, expect, it } from "vitest";
import { decodeEntities, extractJobPostingDescription } from "@/lib/description-fetch";

const LONG_TEXT =
  "We are hiring a Full Stack Engineer to build our platform. ".repeat(10);

const page = (body: string) => `<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`;

describe("extractJobPostingDescription — JSON-LD", () => {
  it("extracts a JobPosting description and decodes its entities", () => {
    const html = page(
      `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        title: "Full Stack Engineer",
        description: `&lt;p&gt;${LONG_TEXT}&lt;/p&gt;`,
      })}</script><div>nav junk</div>`,
    );
    const out = extractJobPostingDescription(html);
    expect(out?.via).toBe("json-ld");
    expect(out?.description).toContain(`<p>${LONG_TEXT}</p>`);
  });

  it("finds JobPosting inside a @graph array", () => {
    const html = page(
      `<script type="application/ld+json">${JSON.stringify({
        "@graph": [
          { "@type": "Organization", name: "Acme" },
          { "@type": "JobPosting", description: `<p>${LONG_TEXT}</p>` },
        ],
      })}</script>`,
    );
    expect(extractJobPostingDescription(html)?.via).toBe("json-ld");
  });

  it("skips malformed JSON-LD without crashing", () => {
    const html = page(
      `<script type="application/ld+json">{not json</script><main><p>${LONG_TEXT}</p></main>`,
    );
    const out = extractJobPostingDescription(html);
    expect(out?.via).toBe("content");
  });

  it("ignores a JobPosting with a trivially short description", () => {
    const html = page(
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "JobPosting",
        description: "Great job!",
      })}</script>`,
    );
    expect(extractJobPostingDescription(html)).toBeNull();
  });
});

describe("extractJobPostingDescription — content fallback", () => {
  it("uses <main> content with scripts and nav stripped", () => {
    const html = page(
      `<nav>Home About</nav><main><script>track()</script><p>${LONG_TEXT}</p></main><footer>©</footer>`,
    );
    const out = extractJobPostingDescription(html);
    expect(out?.via).toBe("content");
    expect(out?.description).toContain(LONG_TEXT.trim());
    expect(out?.description).not.toContain("track()");
  });

  it("returns null for a page with no real content (auth wall)", () => {
    expect(
      extractJobPostingDescription(page("<main><p>Sign in to continue</p></main>")),
    ).toBeNull();
  });
});

describe("decodeEntities", () => {
  it("decodes named and numeric entities", () => {
    expect(decodeEntities("&lt;p&gt;Caf&#233; &amp; t&#xE9;&lt;/p&gt;")).toBe("<p>Café & té</p>");
  });
});
