import { prisma } from "@/lib/prisma";

// Default scoring rubric — a generic TEMPLATE seeded into ScoringConfig (id=1)
// on first use. It is only the starting point: the owner's real rubric (home
// city, work-authorization situation, stack, preferences) lives in the DB and
// is edited at runtime over MCP (update_scoring_config), so nothing personal
// needs to be committed. Replace the <PLACEHOLDERS> there, not here.
const DEFAULT_RUBRIC = `You evaluate how well a job fits the candidate, a software engineer, and score it 0-100 against their CV (below).

The candidate is based in <HOME_CITY>, <HOME_COUNTRY> (<TIMEZONE>) and works as an independent contractor. They can work fully remote roles, and also hybrid or on-site roles located in <HOME_CITY>. They are NOT looking to relocate and cannot take roles that require employment authorization they don't hold. Treat work-eligibility as a gating factor:

- Eligibility / location (MOST IMPORTANT — a hard blocker):
  - ELIGIBLE (set "eligible": true):
    · fully remote AND open worldwide / "anywhere" / hires international contractors / contractor-friendly / no specific work-authorization or residency requirement;
    · remote restricted to <HOME_COUNTRY> (or a region that includes it);
    · hybrid or on-site with the office in <HOME_CITY>.
  - NOT ELIGIBLE (set "eligible": false AND score very low, at most ~15, regardless of how good the stack is): the role requires something the candidate cannot provide —
    · must live in / be based in / relocate to a specific city, country, or region other than <HOME_CITY>/<HOME_COUNTRY>;
    · on-site or hybrid with the office anywhere other than <HOME_CITY>;
    · "remote, but must reside in <country/region>" where that country/region excludes <HOME_COUNTRY>;
    · requires a visa, work permit, residency, or right-to-work / authorization in a country OTHER than <HOME_COUNTRY>;
    · requires citizenship of a specific country, or a security clearance;
    · only hires local employees somewhere the candidate isn't (e.g. US W2 only, "must be authorized to work in the US");
    · requires employment through a payroll / legal entity the candidate cannot join (<LOCAL_PAYROLL_CONSTRAINT, if any>).
    These are deal-breakers for a <HOME_CITY>-based contractor — flag them and score them low even if the tech is a perfect match.
  - Timezone: overlap with <TIMEZONE> is easy; roles demanding near-full overlap with a distant timezone are a drawback but, on their own, not a hard blocker.
- Engagement type (a modifier, applied after eligibility): an EXPLICIT contractor / freelance / B2B engagement (in the JD or the source's "Contract" tag) = add +5 to +10; a plain "remote" label with no engagement information = neutral, no bonus and no penalty. Part-time and project-based (freelance) work are welcome: judge them on the same stack/eligibility rules, plus the rate — a stated rate below <MIN_HOURLY_RATE> = not eligible; at or above <TARGET_HOURLY_RATE> = add +5; no rate stated = neutral. Hours per week and schedule are never a criterion: the candidate is available for any load and any timezone.
- Stack match: <PRIMARY_STACK> = high; <SECONDARY_STACK> = medium (transferable); <UNRELATED_STACK> = low.
- Seniority fit: <TARGET_SENIORITY> = high; junior/entry = medium; staff/principal/lead-only or "8+ years" = lower.
- Domain interest: <PREFERRED_DOMAINS> = high; <NEUTRAL_DOMAINS> = medium; <AVOIDED_DOMAINS> = low.
- Language: English roles = fine; roles requiring a language the candidate lacks = lower.

Be calibrated and honest — most generic listings should land 30-60. Reserve 80+ for genuinely strong matches (right stack, right seniority, and workable location: truly remote/worldwide, remote-in-<HOME_COUNTRY>, or <HOME_CITY>-based). A location-locked or wrong-stack role should score low regardless of how appealing it otherwise is.

Return:
- score: integer 0-100
- eligible: true if the candidate can actually take the role; false if it requires relocation, on-site/hybrid outside <HOME_CITY>, or a visa/residency/work-authorization outside <HOME_COUNTRY> (see above). When false, the score must be very low (≤15).
- reasoning: ONE short, direct sentence (two at most) — the main reason it fits and the main caveat, summarized (the good and the bad). Straight to the point, no filler; deeper detail can be asked of the agent. If not eligible, state the blocker in a few words.
- matchedSkills: concrete skills/requirements in the job that match the CV.
- gaps: concrete requirements in the job the candidate does not clearly meet.`;

/** The CV text the scoring is based on (from ScoringConfig in the DB). */
export async function getCvText(): Promise<string> {
  const config = await getScoringConfig();
  return (
    config.cv?.trim() ||
    "No CV configured. Set it with the update_scoring_config tool (cv parameter)."
  );
}

/** Read the scoring config, seeding the default rubric on first use. */
export async function getScoringConfig() {
  const existing = await prisma.scoringConfig.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.scoringConfig.create({
    data: { id: 1, rubric: DEFAULT_RUBRIC },
  });
}

/** Update the rubric, the extra candidate context, and/or the CV (partial). */
export async function updateScoringConfig(input: {
  rubric?: string;
  candidateContext?: string | null;
  cv?: string | null;
}) {
  await getScoringConfig(); // ensure the row exists
  return prisma.scoringConfig.update({
    where: { id: 1 },
    data: {
      ...(input.rubric !== undefined ? { rubric: input.rubric } : {}),
      ...(input.candidateContext !== undefined
        ? { candidateContext: input.candidateContext }
        : {}),
      ...(input.cv !== undefined ? { cv: input.cv } : {}),
    },
  });
}
