import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { err, json, text, type McpServer } from "@/lib/mcp/shared";

export function registerEmailTools(server: McpServer) {
  server.registerTool(
    "list_pending_emails",
    {
      title: "List pending emails",
      description:
        "List forwarded job-alert emails that haven't been processed yet, with their raw HTML. Extract the job postings from each (title, company, apply URL, location), add them with add_job (platform = the email's provider), then call mark_email_processed so they aren't returned again. This is how email-sourced jobs (LinkedIn, Jobgether, etc.) get into the app.",
      inputSchema: {
        limit: z.number().int().min(1).max(20).optional().describe("Max emails (default 5)."),
        htmlChars: z
          .number()
          .int()
          .min(1000)
          .max(200_000)
          .optional()
          .describe("Cap on HTML length per email (default 60000)."),
      },
    },
    async ({ limit = 5, htmlChars = 60_000 }) => {
      const emails = await prisma.pendingEmail.findMany({
        where: { processedAt: null },
        orderBy: { receivedAt: "asc" },
        take: limit,
      });
      const remaining = await prisma.pendingEmail.count({ where: { processedAt: null } });
      const payload = emails.map((e) => ({
        id: e.id,
        provider: e.provider,
        subject: e.subject,
        receivedAt: e.receivedAt.toISOString(),
        html: e.html.slice(0, htmlChars),
      }));
      return json({ returned: payload.length, remainingPending: remaining, emails: payload });
    },
  );

  server.registerTool(
    "mark_email_processed",
    {
      title: "Mark email processed",
      description:
        "Mark a pending email as processed (after you've extracted its jobs with add_job) so list_pending_emails won't return it again.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const existing = await prisma.pendingEmail.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return err(`No pending email with id ${id}.`);
      await prisma.pendingEmail.update({ where: { id }, data: { processedAt: new Date() } });
      return text(`Marked email ${id} processed.`);
    },
  );
}
