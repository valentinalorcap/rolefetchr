import { describe, expect, it } from "vitest";
import { compactEmail } from "@/lib/email-compact";

describe("compactEmail", () => {
  it("keeps links inline as 'text (url)' with tracking params stripped", () => {
    const out = compactEmail(
      '<p><a href="https://l.example/job/1?trk=abc&mcid=9">Frontend Engineer</a></p>',
    );
    expect(out).toBe("Frontend Engineer (https://l.example/job/1)");
  });

  it("drops style/script/head blocks and comments", () => {
    const out = compactEmail(
      "<style>.a{color:red}</style><!-- hidden --><p>Real content</p>",
    );
    expect(out).toBe("Real content");
  });

  it("strips the invisible padding characters boards stuff emails with", () => {
    const out = compactEmail("<p>Fron​tend­ Engineer﻿</p>");
    expect(out).toBe("Frontend Engineer");
  });

  it("turns block endings into line breaks and collapses blank runs", () => {
    const out = compactEmail(
      "<div>One</div><div></div><div></div><div>Two</div>",
    );
    const lines = out.split("\n").map((l) => l.trim());
    expect(lines.filter(Boolean)).toEqual(["One", "Two"]);
    expect(out).not.toMatch(/\n\s*\n\s*\n/); // never more than one blank line
  });

  it("decodes the entities that matter for readable text", () => {
    expect(compactEmail("<p>Fish &amp; chips &#39;fresh&#39;</p>")).toBe(
      "Fish & chips 'fresh'",
    );
  });
});
