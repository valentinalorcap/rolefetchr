// Free, no-LLM relevance gate applied at ingestion: keep only software /
// engineering roles, since that's the only thing this search targets.
//
// It decides on the TITLE alone. Source tags (RemoteOK & friends) are unreliable
// — they routinely attach tech tags like "Full-Stack Programming", "embedded" or
// "data science" to clearly non-tech listings — so they're ignored here.
//
// Model: keep a job only if its title carries a concrete software/engineering
// signal (ALLOW) and is not one of the "has a tech word but isn't a SWE role"
// exceptions (DENY_OVERRIDE). Everything else is dropped. Validated against the
// live dataset: no real software/engineering title is dropped.

// Concrete software / engineering title signals.
const ALLOW =
  /\b(software|developer|dev\b|engineer|engineering|programmer|coder|full[\s-]?stack|front[\s-]?end|back[\s-]?end|web\s?dev|sde|swe|devops|sre|site\sreliability|typescript|javascript|node(\.?js)?|nest(\.?js)?|next(\.?js)?|angular|react|vue|svelte|python|django|flask|fastapi|rails|golang|rust|kotlin|swift|scala|\.net|c#|c\+\+|\bphp\b|laravel|symfony|elixir|graphql|microservice|kubernetes|docker|terraform|data\sengineer|ml\sengineer|machine\slearning\sengineer|ai\sengineer|sdet|automation\sengineer|qa\sengineer|test\sengineer|mobile\s(developer|engineer)|ios\s(developer|engineer)|android\s(developer|engineer)|flutter|firmware|embedded\s(engineer|software|systems|developer)|blockchain\s(developer|engineer)|smart\scontract|security\sengineer|systems\sengineer|platform\sengineer|infrastructure\sengineer|cloud\sengineer|(software|solutions|cloud|data|systems|technical|principal|staff)\sarchitect|tech(nical)?\slead)\b/i;

// Titles that contain a tech word but are not software-engineering roles.
const DENY_OVERRIDE =
  /\b(sales\sengineer|solutions\sengineer|support\sengineer|customer\ssuccess|implementation\s(engineer|specialist|consultant)|technical\s(recruiter|sourcer|writer|support|account)|developer\s(advocate|relations)|dev\srel|sales\sdevelopment|pre[\s-]?sales)\b/i;

/** True if the job is not a software/engineering role (drop it before storing). */
export function isIrrelevant(title: string): boolean {
  if (DENY_OVERRIDE.test(title)) return true;
  return !ALLOW.test(title);
}
