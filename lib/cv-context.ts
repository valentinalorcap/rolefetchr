import { readFileSync } from "fs";
import path from "path";

// The scoring rubric. Kept in the cached system prefix alongside the CV so it's
// billed once per cache window, not per job. See PLAN.md Phase 3.
const RUBRIC = `You evaluate how well a remote job fits Valentina, a mid-level Software Engineer. Score each job 0-100 for fit against her CV below.

Weigh these factors:
- Stack match: TypeScript/Angular/React/Node/NestJS = high; Ruby/Go/Python/PHP = medium (transferable); Java/.NET enterprise, pure data/ML, pure devops = low.
- Location / remote eligibility: remote and Europe/Spain-friendly or worldwide = high; US-only or US-timezone-required = very low (she is Madrid-based, contractor/EOR).
- Seniority fit: mid / mid-senior / "3-5 years" = high; junior/entry = medium; staff/principal/lead-only or "8+ years" = lower.
- Domain interest: AI / developer tooling / B2B SaaS = high; fintech/healthcare = medium; crypto/gambling/defense/adtech = low.
- Language: English-speaking roles = fine; roles requiring a language she doesn't have (German, French, etc.) = lower.

Be calibrated and honest — most generic listings should land 30-60. Reserve 80+ for genuinely strong matches. Penalize US-only roles hard regardless of stack.

Return:
- score: integer 0-100
- reasoning: 2-3 sentences on the fit, grounded in the CV and the job.
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

/** Stable system prompt (rubric + CV) — cached across all job scorings. */
export function buildScoringSystemPrompt(): string {
  return `${RUBRIC}\n\n=== CANDIDATE CV (source of truth) ===\n\n${loadCv()}`;
}
