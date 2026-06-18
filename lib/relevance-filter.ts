// Free, no-LLM relevance gate applied at ingestion: keep only the kind of role
// this search targets — mid/senior web software/engineering — and drop the rest.
//
// It decides on the TITLE alone (source tags are unreliable). A job is kept only
// when its title carries a software/engineering signal (ALLOW) and matches none
// of the exclusions (DENY). The exclusions cover, beyond plain non-tech roles:
//   - non-software engineering disciplines (civil, electrical, hardware, …);
//   - specialties out of scope (devops/SRE/infra/platform, security);
//   - "tech word but not a SWE role" (sales/solutions/support engineer, …);
//   - seniorities not targeted (intern, junior, staff).
// Validated against the live dataset: no targeted web/full-stack role is dropped.

// Software / engineering title signals.
const ALLOW =
  /\b(software|developer|dev\b|engineer|engineering|programmer|coder|full[\s-]?stack|front[\s-]?end|back[\s-]?end|web\s?dev|sde|swe|typescript|javascript|node(\.?js)?|nest(\.?js)?|next(\.?js)?|angular|react|vue|svelte|python|django|flask|fastapi|rails|golang|rust|kotlin|swift|scala|\.net|c#|c\+\+|\bphp\b|laravel|symfony|elixir|graphql|mobile\s(developer|engineer)|ios\s(developer|engineer)|android\s(developer|engineer)|flutter|react\s?native|(software|solutions|application)\sarchitect|tech(nical)?\slead)\b/i;

// Drop even if a title matches ALLOW.
const DENY =
  /\b((civil|electrical|mechanical|hardware|structural|chemical|industrial|aerospace|biomedical|environmental|manufacturing|controls|network|optical|petroleum|process|quality|safety|materials|geotechnical|nuclear|marine)\s?engineer|operations\sengineer|field\sengineer|data\s?cent(er|re)|hardware|devops|sre|site\s?reliability|reliability\sengineer|security\sengineer|infosec|cyber\s?security|platform\sengineer|infrastructure\sengineer|cloud\sengineer|systems\sengineer|sales\sengineer|solutions\sengineer|support\sengineer|customer\ssuccess|implementation\s(engineer|specialist|consultant)|technical\s(recruiter|sourcer|writer|support|account)|developer\s(advocate|relations)|dev\srel|sales\sdevelopment|pre[\s-]?sales|intern(ship)?|junior|\bjr\b|staff|entry[\s-]?level|graduate|trainee|apprentice)\b/i;

/** True if the job is not a targeted software role (drop it before storing). */
export function isIrrelevant(title: string): boolean {
  if (DENY.test(title)) return true;
  return !ALLOW.test(title);
}
