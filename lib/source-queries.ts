import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getScoringConfig } from "@/lib/cv-context";

// Per-source search queries. The code ships generic defaults; the owner's real
// targeting (stack keywords, cities, countries, employment types) is stored in
// ScoringConfig.sourceQueries and edited over MCP, so it never has to live in
// the repository. Only sources that search by query are configurable here.

export const jsearchQuerySchema = z.object({
  query: z.string().trim().min(1).describe('Search text, e.g. "remote typescript engineer" or "react developer contract <city>".'),
  remoteOnly: z.boolean().default(true).describe("Ask the API for remote jobs only."),
  country: z
    .string()
    .trim()
    .length(2)
    .toLowerCase()
    .optional()
    .describe('ISO 3166-1 alpha-2 country code to search in, e.g. "us", "de", "au".'),
  employmentTypes: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Comma-separated JSearch employment types: FULLTIME, CONTRACTOR, PARTTIME, INTERN."),
});
export type JSearchQuery = z.infer<typeof jsearchQuerySchema>;

export const sourceQueriesSchema = z.object({
  jsearch: z.array(jsearchQuerySchema).min(1).max(10).optional(),
});
export type SourceQueries = z.infer<typeof sourceQueriesSchema>;

/** Generic stack-oriented defaults used when nothing is configured. */
export const DEFAULT_JSEARCH_QUERIES: JSearchQuery[] = [
  { query: "remote typescript engineer", remoteOnly: true },
  { query: "remote angular developer", remoteOnly: true },
  { query: "remote fullstack typescript", remoteOnly: true },
];

/** Stored queries (validated), or null when unset / unreadable. */
export async function getSourceQueries(): Promise<SourceQueries | null> {
  const config = await getScoringConfig();
  if (config.sourceQueries == null) return null;
  const parsed = sourceQueriesSchema.safeParse(config.sourceQueries);
  return parsed.success ? parsed.data : null;
}

/** JSearch queries to run: the configured list, else the generic defaults. */
export async function getJsearchQueries(): Promise<JSearchQuery[]> {
  const stored = await getSourceQueries();
  return stored?.jsearch?.length ? stored.jsearch : DEFAULT_JSEARCH_QUERIES;
}

/** Replace the stored queries (pass null to fall back to the defaults). */
export async function updateSourceQueries(queries: SourceQueries | null) {
  await getScoringConfig(); // ensure the singleton row exists
  return prisma.scoringConfig.update({
    where: { id: 1 },
    data: { sourceQueries: queries ?? undefined },
  });
}
