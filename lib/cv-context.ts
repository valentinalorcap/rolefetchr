import { readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";

// Default scoring rubric. Seeded into ScoringConfig (id=1) on first use; after
// that it's editable at runtime (e.g. by an external agent over MCP), so this
// constant is only the starting point.
const DEFAULT_RUBRIC = `You evaluate how well a remote job fits Valentina, a mid-level Software Engineer, and score it 0-100 against her CV (below).

Valentina works fully remote as an independent contractor (via an EOR, Deel), based in Madrid (CET). She is NOT looking to relocate and cannot take roles that require employment authorization she doesn't hold. Treat work-eligibility as a gating factor:

- Eligibility / location (MOST IMPORTANT — a hard blocker):
  - ELIGIBLE (set "eligible": true): fully remote AND open worldwide / "anywhere" / hires international contractors / EOR- or contractor-friendly / no specific work-authorization or residency requirement.
  - NOT ELIGIBLE (set "eligible": false AND score very low, at most ~15, regardless of how good the stack is): the role requires something she cannot provide —
    · must live in / be based in / relocate to a specific city, country, or region;
    · on-site or hybrid;
    · "remote, but must reside in <country/region>" or "remote within <country>";
    · requires a visa, work permit, residency, or right-to-work / authorization in a country OTHER than Spain;
    · requires citizenship of a specific country, or a security clearance;
    · only hires local employees (e.g. US W2 only, "EU citizens only", "must be authorized to work in the US").
    These are deal-breakers for a Madrid-based contractor — flag them and score them low even if the tech is a perfect match.
  - Timezone: CET overlap is easy; roles demanding near-full US-hours overlap are a drawback but, on their own, not a hard blocker.
- Stack match: TypeScript/Angular/React/Node/NestJS = high; Ruby/Go/Python/PHP = medium (transferable); Java/.NET enterprise, pure data/ML, pure devops = low.
- Seniority fit: mid / mid-senior / "3-5 years" = high; junior/entry = medium; staff/principal/lead-only or "8+ years" = lower.
- Domain interest: AI / developer tooling / B2B SaaS = high; fintech/healthcare = medium; crypto/gambling/defense/adtech = low.
- Language: English roles = fine; roles requiring a language she lacks (German, French, etc.) = lower.

Be calibrated and honest — most generic listings should land 30-60. Reserve 80+ for genuinely strong matches (right stack, mid-level, truly remote/worldwide). A location-locked or wrong-stack role should score low regardless of how appealing it otherwise is.

Return:
- score: integer 0-100
- eligible: true if she can actually take the role; false if it requires relocation, on-site/hybrid, or a visa/residency/work-authorization outside Spain (see above). When false, the score must be very low (≤15).
- reasoning: 2-3 sentences on the fit, grounded in the CV and the job. If not eligible, say why explicitly.
- matchedSkills: concrete skills/requirements in the job that match her CV.
- gaps: concrete requirements in the job she does not clearly meet.`;

let cachedCv: string | null = null;

function loadCv(): string {
  if (cachedCv === null) {
    cachedCv = readFileSync(
      path.join(process.cwd(), "cv-context.md"),
      "utf8",
    ).trim();
  }
  return cachedCv;
}

/** The CV text the scoring is based on (from cv-context.md). */
export function getCvText(): string {
  return loadCv();
}

/** Read the scoring config, seeding the default rubric on first use. */
export async function getScoringConfig() {
  const existing = await prisma.scoringConfig.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.scoringConfig.create({
    data: { id: 1, rubric: DEFAULT_RUBRIC },
  });
}

/** Update the rubric and/or the extra candidate context (partial). */
export async function updateScoringConfig(input: {
  rubric?: string;
  candidateContext?: string | null;
}) {
  await getScoringConfig(); // ensure the row exists
  return prisma.scoringConfig.update({
    where: { id: 1 },
    data: {
      ...(input.rubric !== undefined ? { rubric: input.rubric } : {}),
      ...(input.candidateContext !== undefined
        ? { candidateContext: input.candidateContext }
        : {}),
    },
  });
}

/**
 * Stable system prompt for scoring: current rubric + CV + any extra candidate
 * context. Cached per request via prompt caching; rubric edits invalidate it
 * (expected). Async because the rubric now lives in the DB.
 */
export async function buildScoringSystemPrompt(): Promise<string> {
  const cfg = await getScoringConfig();
  const extra = cfg.candidateContext?.trim()
    ? `\n\n=== ADDITIONAL CONTEXT ABOUT THE CANDIDATE ===\n\n${cfg.candidateContext.trim()}`
    : "";
  return `${cfg.rubric}\n\n=== CANDIDATE CV (source of truth) ===\n\n${loadCv()}${extra}`;
}
