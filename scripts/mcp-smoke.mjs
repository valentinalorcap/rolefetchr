import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PORT = process.env.PORT || "3000";
const TOKEN = process.env.MCP_TOKEN;
const url = new URL(`http://localhost:${PORT}/api/mcp`);

const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
});
const client = new Client({ name: "smoke-test", version: "1.0.0" });

await client.connect(transport);
console.log("connected ✓");

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name).join(", "));

const add = await client.callTool({
  name: "add_job",
  arguments: {
    platform: "LinkedIn",
    url: "https://www.linkedin.com/jobs/view/smoke-test-frontend-9999",
    title: "Senior Frontend Engineer (Angular/TypeScript)",
    company: "Acme EU Remote",
    description:
      "<p>We are hiring a Senior Frontend Engineer to work fully remote from anywhere in Europe. Stack: Angular, TypeScript, RxJS, NgRx. You will own core UI modules, build reusable components, and improve performance. EU contractor-friendly. English required.</p><ul><li>5+ years with Angular and TypeScript</li><li>Remote, Europe timezones</li></ul>",
    location: "Remote (Europe)",
    salary: "€60k - €80k",
    tags: ["angular", "typescript", "rxjs", "remote"],
  },
});
console.log("\n--- add_job result ---\n" + add.content[0].text);

const recent = await client.callTool({
  name: "recent_matches",
  arguments: { limit: 5, minScore: 30 },
});
console.log("\n--- recent_matches (top 5) ---\n" + recent.content[0].text);

await client.close();
console.log("\nclosed ✓");
