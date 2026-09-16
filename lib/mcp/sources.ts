import { z } from "zod";
import {
  DEFAULT_JSEARCH_QUERIES,
  adzunaQuerySchema,
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
        "Read the search queries the ingestion runs per source (JSearch and Adzuna). JSearch returns the configured list or the generic built-in defaults; Adzuna has no defaults (a country edition is required) and is idle until configured. Use it before update_source_queries so you edit rather than overwrite.",
      inputSchema: {},
    },
    async () => {
      const stored = await getSourceQueries();
      return json({
        configured: stored != null,
        jsearch: stored?.jsearch ?? DEFAULT_JSEARCH_QUERIES,
        adzuna: stored?.adzuna ?? [],
      });
    },
  );

  server.registerTool(
    "update_source_queries",
    {
      title: "Update source queries",
      description:
        "Replace the search queries the daily ingestion runs for a source (1-10 entries per source; a source you omit keeps its current list). JSearch: Google-for-Jobs style queries with optional country (ISO alpha-2), employment types (FULLTIME, CONTRACTOR, PARTTIME, INTERN) and remoteOnly flag; a non-remote query is how on-site/hybrid jobs in a given city get ingested; the API matches terms literally, so prefer broad phrasings; each query costs one request per daily run (free tier: 200/month). Adzuna: keyword + required country edition (e.g. \"gb\", \"au\"), optional place name and contractOnly flag; there is no remote filter, so put \"remote\" in the query text; results carry only a description snippet, so the agent must fetch the full posting before scoring. Pass reset=true to drop all configuration (JSearch returns to its built-in defaults, Adzuna goes idle). Takes effect on the next ingestion run.",
      inputSchema: {
        jsearch: z.array(jsearchQuerySchema).min(1).max(10).optional(),
        adzuna: z.array(adzunaQuerySchema).min(1).max(10).optional(),
        reset: z
          .boolean()
          .optional()
          .describe("True to clear the stored queries and use the defaults."),
      },
    },
    async ({ jsearch, adzuna, reset = false }) => {
      if (reset) {
        await updateSourceQueries(null);
        return text("Source queries cleared — JSearch uses the built-in defaults, Adzuna is idle.");
      }
      if (!jsearch?.length && !adzuna?.length) return err("Pass jsearch and/or adzuna (1-10 queries each) or reset=true.");
      const stored = await getSourceQueries();
      const next = {
        jsearch: jsearch?.length ? jsearch : stored?.jsearch,
        adzuna: adzuna?.length ? adzuna : stored?.adzuna,
      };
      await updateSourceQueries(next);
      const parts: string[] = [];
      if (jsearch?.length)
        parts.push(`${jsearch.length} JSearch quer${jsearch.length === 1 ? "y" : "ies"} (${jsearch.filter((q) => !q.remoteOnly).length} non-remote)`);
      if (adzuna?.length)
        parts.push(`${adzuna.length} Adzuna quer${adzuna.length === 1 ? "y" : "ies"} (${[...new Set(adzuna.map((q) => q.country))].join(", ")})`);
      return text(`Stored ${parts.join(" and ")}. Next ingestion run uses them.`);
    },
  );
}
