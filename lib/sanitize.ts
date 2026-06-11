import sanitizeHtml from "sanitize-html";

// Job descriptions are HTML from external boards (and freeform on HN). Render a
// safe, structure-preserving subset so paragraphs, lists, and emphasis survive
// — never raw HTML (XSS), never flattened to one dense block.
export function sanitizeDescription(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "u",
      "h3", "h4", "h5", "h6", "a", "code", "pre", "blockquote", "span",
    ],
    allowedAttributes: { a: ["href", "title"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      // Demote source headings so they sit below the page's job title.
      h1: "h3",
      h2: "h3",
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
    },
    // Drop empty leftovers (e.g. <p></p>) the boards love to emit.
    exclusiveFilter: (frame) =>
      ["p", "span", "h3"].includes(frame.tag) && !frame.text.trim(),
  });
}
