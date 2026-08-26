import type { createMcpHandler } from "mcp-handler";

// The server instance the tool modules register on (mcp-handler doesn't export
// the type directly, so it's derived from the handler factory's signature).
export type McpServer = Parameters<Parameters<typeof createMcpHandler>[0]>[0];

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

/** Plain-text tool result. */
export const text = (t: string): ToolResult => ({
  content: [{ type: "text", text: t }],
});

/** Error tool result. */
export const err = (t: string): ToolResult => ({
  content: [{ type: "text", text: t }],
  isError: true,
});

/** Pretty-printed JSON tool result. */
export const json = (value: unknown): ToolResult =>
  text(JSON.stringify(value, null, 2));

// The job description is rendered as HTML (Tailwind `prose`), NOT markdown — so
// `##` and `**` show up literally. This tells the agent to format with HTML tags
// so descriptions read with real headings, bold and lists.
export const DESCRIPTION_GUIDANCE =
  "Full job description. It is rendered as HTML (NOT markdown): do NOT use markdown like ## or **, they appear literally. Format with HTML tags — <h3> for section headings (h1/h2 are auto-demoted to h3), <strong> for bold, <p> for paragraphs, <ul>/<ol> + <li> for lists, <a href> for links, <br> for line breaks. Allowed tags: p, br, ul, ol, li, strong, b, em, i, u, h3-h6, a, code, pre, blockquote, span — anything else is stripped, and empty tags are dropped. Company, location and salary already show in the card and header, so start the body with content (e.g. <h3>About the role</h3>) instead of repeating a Company/Location/Salary metadata block.";
