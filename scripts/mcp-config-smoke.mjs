import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PORT = process.env.PORT || "3000";
const TOKEN = process.env.MCP_TOKEN;
const transport = new StreamableHTTPClientTransport(
  new URL(`http://localhost:${PORT}/api/mcp`),
  { requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } } },
);
const client = new Client({ name: "config-smoke", version: "1.0.0" });
await client.connect(transport);
console.log("connected ✓\ntools:", (await client.listTools()).tools.map((t) => t.name).join(", "));

const text = (r) => r.content[0].text;

console.log("\n--- get_scoring_config (before) ---");
console.log(text(await client.callTool({ name: "get_scoring_config", arguments: {} })).slice(0, 280) + "…");

console.log("\n--- update_scoring_config (set candidateContext) ---");
console.log(text(await client.callTool({
  name: "update_scoring_config",
  arguments: { candidateContext: "TEST: Valentina prefers product/dev-tooling companies and avoids pure agencies." },
})));

console.log("\n--- get_scoring_config (after) — context present? ---");
const after = text(await client.callTool({ name: "get_scoring_config", arguments: {} }));
console.log("context line:", after.split("CANDIDATE CONTEXT ===")[1]?.split("===")[0]?.trim().slice(0, 120));

console.log("\n--- rescore_all (confirm:false, should NOT clear) ---");
console.log(text(await client.callTool({ name: "rescore_all", arguments: { confirm: false } })));

console.log("\n--- cleanup: clear test context ---");
console.log(text(await client.callTool({ name: "update_scoring_config", arguments: { candidateContext: "" } })));

await client.close();
console.log("\nclosed ✓");
