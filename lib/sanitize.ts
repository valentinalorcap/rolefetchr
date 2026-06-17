import sanitizeHtml from "sanitize-html";

// Detects whether a description already carries HTML structure.
const HTML_HINT =
  /<\/?(p|br|ul|ol|li|div|h[1-6]|strong|em|b|i|span|a|table|section)\b/i;

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Some boards (notably JSearch / Google for Jobs) return descriptions as plain
// text whose only structure is newlines — which collapse to one dense block when
// rendered as HTML. Rebuild paragraphs (blank-line separated) and line breaks so
// the posting reads the way it was published.
function plainTextToHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeText(block.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const OPTIONS: sanitizeHtml.IOptions = {
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
};

// Job descriptions come as HTML from most boards, and as plain text from some
// (e.g. JSearch). Render a safe, structure-preserving subset — never raw HTML
// (XSS), never flattened to one dense block.
export function sanitizeDescription(input: string): string {
  const html = HTML_HINT.test(input) ? input : plainTextToHtml(input);
  return sanitizeHtml(html, OPTIONS);
}
