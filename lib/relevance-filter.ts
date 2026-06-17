// Free, no-LLM relevance gate applied at ingestion: drop jobs that are clearly
// not software/engineering roles before they're stored, so they don't clutter
// the app or burn the external scoring agent's tokens.
//
// High precision by design: an ALLOW signal (any concrete tech keyword in the
// title or tags) ALWAYS keeps the job, overriding the DENY list — so a real
// match is never dropped. Only titles with a clear non-software signal and no
// tech signal are rejected.

// Concrete tech signals — if any of these appear, keep the job.
const ALLOW =
  /\b(software|developer|develop|engineer|engineering|programmer|coding|full[\s-]?stack|front[\s-]?end|back[\s-]?end|web\s?dev|typescript|javascript|node(\.?js)?|nest(\.?js)?|next(\.?js)?|angular|react|vue|svelte|python|django|flask|fastapi|ruby|rails|go(lang)?|rust|java|kotlin|scala|\.net|c#|c\+\+|php|laravel|symfony|elixir|api|graphql|rest|microservices|devops|sre|platform|infrastructure|cloud|aws|gcp|azure|kubernetes|docker|terraform|postgres|mysql|mongodb|redis|sql|database|data\s?(engineer|science|scientist)|machine\s?learning|\bml\b|\bai\b|\bllm\b|qa|sdet|test\s?automation|mobile|ios|android|flutter|react\s?native|firmware|embedded|blockchain|smart\s?contract|cyber\s?security|infosec|ux|ui|design\s?system)\b/i;

// Clear non-software roles for a software engineer's search.
const DENY =
  /\b(sales|account\s(executive|manager)|business\sdevelopment|marketing|growth\smarketer|seo|copywriter|content\s(writer|strategist)|social\smedia|community\smanager|customer\s(support|success|service|care)|support\s(specialist|agent|representative|engineer\s?ii?)|help\s?desk|recruit(er|ing|ment)|talent\s(acquisition|partner)|human\sresources|\bhr\b|people\sops|learning\s(and|&)\sdevelopment|l&d|trainer|teacher|teaching|tutor|professor|instructor|lecturer|nurse|nursing|clinical|medical|physician|surgeon|doctor|therapist|caregiver|pharmacist|dental|veterinar|accountant|accounting|bookkeep|payroll|auditor|tax\b|underwriter|insurance|claims|paralegal|attorney|lawyer|legal\scounsel|notary|driver|courier|delivery|mail\scarrier|truck|warehouse|forklift|logistics\sassociate|\bcrew\b|barista|cook|chef|server|waiter|waitress|cashier|retail|store\s(manager|associate)|merchandiser|cleaner|janitor|housekeep|maid|security\sguard|construction|carpenter|electrician|plumber|welder|hvac|mechanic|laborer|operator|administrative\s(assistant|coordinator)|executive\sassistant|receptionist|secretary|data\sentry|virtual\sassistant|scrum\smaster|graphic\sdesigner|illustrator|video\seditor|photographer|videographer|animator|translator|interpreter|real\sestate|loan\sofficer|teller|appraiser|estimator|inspector|dispatcher|call\scenter|telemarket)\b/i;

// RemoteOK & friends sometimes tag non-tech roles explicitly.
const NON_TECH_TAG = /\bnon[\s-]?tech\b/i;

/** True if the job is clearly not a software/engineering role (drop it). */
export function isIrrelevant(title: string, tags: string[] = []): boolean {
  const haystack = `${title} ${tags.join(" ")}`;
  if (ALLOW.test(haystack)) return false; // any concrete tech signal → keep
  if (DENY.test(title)) return true;
  if (tags.some((t) => NON_TECH_TAG.test(t))) return true;
  return false; // ambiguous → keep, let the scoring agent decide
}
