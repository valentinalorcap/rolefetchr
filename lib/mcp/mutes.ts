import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { companyKey } from "@/lib/normalize";
import { err, text, type McpServer } from "@/lib/mcp/shared";

// Muted publishers: accounts that aren't employers but bots reposting the same
// ad daily under fresh URLs without naming the real client. Muted names are
// matched on the normalized company identity, so "Hire Feed Ltd" and
// "hire feed" are the same entry. Muting blocks ingestion (sources + add_job)
// and hides existing jobs from get_unscored_jobs.

export function registerMuteTools(server: McpServer) {
  server.registerTool(
    "mute_source",
    {
      title: "Mute a publisher",
      description:
        "Mute a publisher/company by name (repost bots that spam the same ad under fresh URLs). Matched on the normalized name. Muted publishers are blocked from ingestion (auto sources and add_job/add_jobs) and their existing jobs stop appearing in get_unscored_jobs. Existing jobs are NOT deleted.",
      inputSchema: {
        name: z.string().describe('The publisher name as it appears on jobs, e.g. "Hire Feed".'),
      },
    },
    async ({ name }) => {
      const key = companyKey(name);
      if (!key) return err(`"${name}" normalizes to an empty key — nothing muted.`);
      await prisma.mutedSource.upsert({
        where: { key },
        create: { key, label: name.trim() },
        update: { label: name.trim() },
      });
      const existing = await prisma.job.count({ where: { companyKey: key, demoCode: null } });
      return text(
        `Muted "${name.trim()}" (key: ${key}). New postings from it are blocked; ` +
          `${existing} existing job${existing === 1 ? "" : "s"} will no longer appear in get_unscored_jobs.`,
      );
    },
  );

  server.registerTool(
    "unmute_source",
    {
      title: "Unmute a publisher",
      description: "Remove a publisher from the muted list so its postings flow again.",
      inputSchema: {
        name: z.string().describe("The publisher name (or its normalized key)."),
      },
    },
    async ({ name }) => {
      const key = companyKey(name);
      const row = await prisma.mutedSource.findUnique({ where: { key } });
      if (!row) return err(`"${name}" (key: ${key}) is not muted. See list_muted.`);
      await prisma.mutedSource.delete({ where: { key } });
      return text(`Unmuted "${row.label}" (key: ${key}).`);
    },
  );

  server.registerTool(
    "list_muted",
    {
      title: "List muted publishers",
      description:
        "List every muted publisher with its normalized key, when it was muted, and how many stored jobs it has.",
      inputSchema: {},
    },
    async () => {
      const rows = await prisma.mutedSource.findMany({ orderBy: { createdAt: "asc" } });
      if (rows.length === 0) return text("No muted publishers.");
      const lines = await Promise.all(
        rows.map(async (m) => {
          const jobs = await prisma.job.count({ where: { companyKey: m.key, demoCode: null } });
          return `${m.label} (key: ${m.key}) · ${jobs} stored job${jobs === 1 ? "" : "s"} · muted ${m.createdAt.toISOString().slice(0, 10)}`;
        }),
      );
      return text(lines.join("\n"));
    },
  );
}
