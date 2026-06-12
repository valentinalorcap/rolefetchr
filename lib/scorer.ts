import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Job } from "@prisma/client";
import { buildScoringSystemPrompt } from "./cv-context";
import { stripHtml } from "./format";

// Locked in PLAN.md. Sonnet balances quality and cost for batch scoring.
export const SCORING_MODEL = "claude-sonnet-4-6";

// Cap the description to keep token cost bounded; the head carries the signal.
const MAX_DESCRIPTION_CHARS = 6000;

export const ScoreSchema = z.object({
  score: z.number().min(0).max(100),
  eligible: z
    .boolean()
    .describe(
      "False if the role requires something Valentina can't provide: relocation / living in a specific city, on-site or hybrid, or a visa/residency/work-authorization in a country other than Spain. A hard blocker — when false, the score must also be very low.",
    ),
  reasoning: z.string(),
  matchedSkills: z.array(z.string()),
  gaps: z.array(z.string()),
});

export type JobScoreResult = z.infer<typeof ScoreSchema>;

const anthropic = new Anthropic();

function buildJobPrompt(job: Job): string {
  const description = stripHtml(job.description).slice(0, MAX_DESCRIPTION_CHARS);
  return [
    "Evaluate this job for fit:",
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location ?? "not specified"}`,
    `Salary: ${job.salary ?? "not specified"}`,
    `Tags: ${job.tags.join(", ") || "none"}`,
    "",
    "Description:",
    description,
  ].join("\n");
}

/** Score one job against the CV. Throws if the model returns no valid output. */
export async function scoreJob(job: Job): Promise<JobScoreResult> {
  const response = await anthropic.messages.parse({
    model: SCORING_MODEL,
    max_tokens: 1024,
    thinking: { type: "disabled" },
    system: [
      {
        type: "text",
        text: await buildScoringSystemPrompt(),
        // Cache the rubric+CV prefix; only the per-job user turn varies.
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: { format: zodOutputFormat(ScoreSchema) },
    messages: [{ role: "user", content: buildJobPrompt(job) }],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error(`Scorer returned no structured output (stop: ${response.stop_reason})`);
  }
  return parsed;
}
