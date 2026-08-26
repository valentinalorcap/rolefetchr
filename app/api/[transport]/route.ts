import { createMcpHandler } from "mcp-handler";
import { registerJobWriteTools } from "@/lib/mcp/jobs-write";
import { registerJobReadTools } from "@/lib/mcp/jobs-read";
import { registerScoringTools } from "@/lib/mcp/scoring";
import { registerEmailTools } from "@/lib/mcp/emails";
import { registerDemoTools } from "@/lib/mcp/demo";

// Prisma needs the Node runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

// The tools live in lib/mcp/, one module per domain.
const mcpHandler = createMcpHandler(
  (server) => {
    registerJobWriteTools(server);
    registerJobReadTools(server);
    registerScoringTools(server);
    registerEmailTools(server);
    registerDemoTools(server);
  },
  {},
  { basePath: "/api", maxDuration: 60, verboseLogs: false },
);

// Simple shared-token auth: MCP clients (Claude Code/Desktop) send the header.
function withAuth(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const token = process.env.MCP_TOKEN;
    if (!token || req.headers.get("authorization") !== `Bearer ${token}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return handler(req);
  };
}

const handler = withAuth(mcpHandler);

export { handler as GET, handler as POST };
