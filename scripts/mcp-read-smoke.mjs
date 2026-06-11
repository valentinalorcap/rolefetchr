import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PORT = process.env.PORT || "3000";
const transport = new StreamableHTTPClientTransport(
  new URL(`http://localhost:${PORT}/api/mcp`),
  { requestInit: { headers: { Authorization: `Bearer ${process.env.MCP_TOKEN}` } } },
);
const client = new Client({ name: "read-smoke", version: "1.0.0" });
await client.connect(transport);
const text = (r) => r.content[0].text;
const call = (name, args = {}) => client.callTool({ name, arguments: args });

console.log("tools:", (await client.listTools()).tools.map((t) => t.name).join(", "));

console.log("\n--- stats ---\n" + text(await call("stats")));

console.log("\n--- search_jobs (minScore 50, limit 3) ---");
const search = text(await call("search_jobs", { minScore: 50, limit: 3 }));
console.log(search);
const firstId = search.match(/\[([a-z0-9]+)\]/)?.[1];

console.log(`\n--- get_job(${firstId}) ---`);
console.log(text(await call("get_job", { id: firstId })).slice(0, 420) + "…");

console.log("\n--- get_cv (first 120 chars) ---");
console.log(text(await call("get_cv")).slice(0, 120) + "…");

console.log("\n--- set_job_action SAVED then CLEAR ---");
console.log(text(await call("set_job_action", { jobId: firstId, status: "SAVED", notes: "smoke test" })));
console.log(text(await call("set_job_action", { jobId: firstId, status: "CLEAR" })));

await client.close();
console.log("\nclosed ✓");
