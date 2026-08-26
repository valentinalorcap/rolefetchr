import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { err, text, type McpServer } from "@/lib/mcp/shared";

export function registerDemoTools(server: McpServer) {
  server.registerTool(
    "create_demo_space",
    {
      title: "Create a demo space",
      description:
        "Create a shareable, isolated demo of the whole app. Returns an access code to hand to one recipient — anyone with it sees a full, interactive copy of the app scoped only to this space's data (never the owner's data, never the MCP). Load that space's jobs with add_job (demoCode = the code, vary source for realism), then score them with set_job_score (demoCode via get_unscored_jobs). Provide your own `code` or let one be generated.",
      inputSchema: {
        label: z
          .string()
          .describe("Display name shown in the demo banner (the recipient)."),
        code: z
          .string()
          .min(3)
          .optional()
          .describe("The access code. If omitted, one is generated from the label."),
        message: z
          .string()
          .optional()
          .describe("Optional override for the demo banner copy."),
      },
    },
    async ({ label, code, message }) => {
      const finalCode =
        code?.trim() ||
        `${label.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "DEMO"}-${Math.floor(1000 + Math.random() * 9000)}`;
      const existing = await prisma.demoSpace.findUnique({ where: { code: finalCode }, select: { code: true } });
      if (existing) return err(`A demo space with code "${finalCode}" already exists.`);
      await prisma.demoSpace.create({
        data: { code: finalCode, label, message: message ?? null },
      });
      return text(
        `Created demo space for "${label}". Access code: ${finalCode}\n` +
          `Add jobs with add_job (demoCode: "${finalCode}"), then score them with set_job_score.`,
      );
    },
  );

  server.registerTool(
    "update_demo_space",
    {
      title: "Update a demo space",
      description:
        "Edit a demo space by code without deleting and recreating it: rename its access code (re-tags all of its jobs; the old code stops working immediately), change the label, or change the banner message. Only the fields you pass are changed.",
      inputSchema: {
        code: z.string().describe("The space's current access code."),
        newCode: z
          .string()
          .min(3)
          .optional()
          .describe("A new access code; its jobs are re-tagged and the old code is invalidated."),
        label: z.string().optional().describe("New display name."),
        message: z
          .string()
          .nullable()
          .optional()
          .describe("New banner message; pass null to clear it."),
      },
    },
    async ({ code, newCode, label, message }) => {
      const space = await prisma.demoSpace.findUnique({ where: { code } });
      if (!space) return err(`No demo space with code ${code}.`);
      const fields: Prisma.DemoSpaceUpdateInput = {};
      if (label !== undefined) fields.label = label;
      if (message !== undefined) fields.message = message;

      if (newCode && newCode !== code) {
        const clash = await prisma.demoSpace.findUnique({ where: { code: newCode }, select: { code: true } });
        if (clash) return err(`A demo space with code "${newCode}" already exists.`);
        const jobs = await prisma.job.findMany({ where: { demoCode: code }, select: { id: true, externalId: true } });
        const prefix = `${code}::`;
        await prisma.$transaction([
          prisma.demoSpace.update({ where: { code }, data: { ...fields, code: newCode } }),
          ...jobs.map((j) =>
            prisma.job.update({
              where: { id: j.id },
              data: {
                demoCode: newCode,
                externalId: j.externalId.startsWith(prefix)
                  ? `${newCode}::${j.externalId.slice(prefix.length)}`
                  : j.externalId,
              },
            }),
          ),
        ]);
        return text(
          `Renamed demo space ${code} → ${newCode} (${jobs.length} job${jobs.length === 1 ? "" : "s"} re-tagged).`,
        );
      }

      if (Object.keys(fields).length === 0) return err("Nothing to update.");
      await prisma.demoSpace.update({ where: { code }, data: fields });
      return text(`Updated demo space ${code}.`);
    },
  );

  server.registerTool(
    "list_demo_spaces",
    {
      title: "List demo spaces",
      description:
        "List every demo space with its access code, label, job count, and usage: whether the code has been entered, when it was first used, the last activity, and how many times it was entered.",
      inputSchema: {},
    },
    async () => {
      const spaces = await prisma.demoSpace.findMany({ orderBy: { createdAt: "desc" } });
      if (spaces.length === 0) return text("No demo spaces yet.");
      const lines = await Promise.all(
        spaces.map(async (s) => {
          const jobs = await prisma.job.count({ where: { demoCode: s.code } });
          const usage = s.firstUsedAt
            ? `entered ${s.useCount}× · first ${s.firstUsedAt.toISOString()} · last seen ${s.lastSeenAt?.toISOString() ?? "—"}`
            : "NOT entered yet";
          return `${s.code} · ${s.label} · ${jobs} job${jobs === 1 ? "" : "s"} · ${usage}`;
        }),
      );
      return text(lines.join("\n"));
    },
  );

  server.registerTool(
    "delete_demo_space",
    {
      title: "Delete a demo space",
      description:
        "Delete a demo space and all of its jobs (and their scores/actions). Irreversible — confirm intent.",
      inputSchema: {
        code: z.string(),
        confirm: z.boolean().describe("Must be true to actually delete."),
      },
    },
    async ({ code, confirm }) => {
      if (!confirm) return text("Not confirmed — nothing deleted.");
      const space = await prisma.demoSpace.findUnique({ where: { code }, select: { code: true } });
      if (!space) return err(`No demo space with code ${code}.`);
      const { count } = await prisma.job.deleteMany({ where: { demoCode: code } });
      await prisma.demoSpace.delete({ where: { code } });
      return text(`Deleted demo space ${code} and its ${count} job${count === 1 ? "" : "s"}.`);
    },
  );
}
