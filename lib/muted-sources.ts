import { prisma } from "@/lib/prisma";

/** Normalized company keys muted from ingestion (repost bots, not employers).
 * Jobs from these never enter via the sources or add_job, and existing ones
 * are hidden from the scoring loop. */
export async function getMutedKeys(): Promise<Set<string>> {
  const rows = await prisma.mutedSource.findMany({ select: { key: true } });
  return new Set(rows.map((r) => r.key));
}
