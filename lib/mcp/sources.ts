import { z } from "zod";
import {
  DEFAULT_JSEARCH_QUERIES,
  getSourceQueries,
  jsearchQuerySchema,
  updateSourceQueries,
} from "@/lib/source-queries";
import { err, json, text, type McpServer } from "@/lib/mcp/shared";

export function registerSourceTools(server: McpServer) {
  server.registerTool(
    "get_source_queries",
    {
      title: "Get source queries",
      description:
        "Read the search queries the ingestion runs per source (currently JSearch). Returns the configured list, or the generic built-in defaults when nothing is configured. Use it before update_source_queries so you edit rather than overwrite.",
      inputSchema: {},
    },
    async () => {
      const stored = await getSourceQueries();
      return json({
        configured: stored != null,
        jsearch: stored?.jsearch ?? DEFAULT_JSEARCH_QUERIES,
      });
    },
  );

  server.registerTool(
    "update_source_queries",
    {
      title: "Update source queries",
      description:
        "Replace the JSearch search queries the daily ingestion runs (full replacement, 1-10 entries). Each entry is a Google-for-Jobs style query with optional country (ISO alpha-2), employment types (FULLTIME, CONTRACTOR, PARTTIME, INTERN) and remoteOnly flag; a non-remote query is how on-site/hybrid jobs in a given city get ingested. Wording matters: the API matches terms literally, so prefer broad phrasings (\"software engineer contract <city>\") over narrow ones. Each query costs one API request per daily run (free tier: 200/month). Pass reset=true to drop the configuration and return to the built-in defaults. Takes effect on the next ingestion run.",
      inputSchema: {
        jsearch: z.array(jsearchQuerySchema).min(1).max(10).optional(),
        reset: z
          .boolean()
          .optional()
          .describe("True to clear the stored queries and use the defaults."),
      },
    },
    async ({ jsearch, reset = false }) => {
      if (reset) {
        await updateSourceQueries(null);
        return text("Source queries cleared — ingestion uses the built-in defaults.");
      }
      if (!jsearch?.length) return err("Pass jsearch (1-10 queries) or reset=true.");
      await updateSourceQueries({ jsearch });
      return text(
        `Stored ${jsearch.length} JSearch quer${jsearch.length === 1 ? "y" : "ies"} (${jsearch.filter((q) => !q.remoteOnly).length} non-remote). Next ingestion run uses them.`,
      );
    },
  );
}
