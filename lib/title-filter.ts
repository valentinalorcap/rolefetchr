// Cheap pre-filter: skip the Sonnet scoring call for jobs whose title clearly
// isn't a software-engineering match. High precision by design — if the title
// contains any of Valentina's stack/role keywords it is NEVER rejected, so a
// real match can't be filtered out. Borderline titles (data, design, generic
// "analyst") are left for the model to judge.

const ALLOW =
  /\b(software\s+(engineer|developer|dev)|front[\s-]?end|back[\s-]?end|full[\s-]?stack|web\s+(developer|engineer)|typescript|javascript|react|angular|vue|node|next\.?js|nestjs|rxjs|ngrx|ui\s+(engineer|developer))\b/i;

const DENY =
  /\b(sales|account\s+(executive|manager)|business\s+development|sdr|bdr|marketing|seo|social\s+media|copywriter|content\s+(writer|marketing)|recruit(er|ing|ment)|talent\s+acquisition|sourcer|customer\s+(support|success|service)|support\s+(specialist|agent)|virtual\s+assistant|executive\s+assistant|administrative|data\s+entry|receptionist|project\s+manager|product\s+manager|program\s+manager|scrum\s+master|product\s+owner|business\s+analyst|financial\s+analyst|accountant|accounting|bookkeeper|human\s+resources|\bhr\b|nurse|nursing|physician|clinical|therapist|dentist|pharmacist|teacher|tutor|instructor|attorney|lawyer|paralegal|warehouse|driver|logistics|supply\s+chain|(mechanical|civil|electrical|chemical|industrial|hardware|manufacturing|process|field|sales|biomedical|structural|petroleum)\s+engineer|ventas|comercial|mercadotecnia|mercadeo|recursos\s+humanos|enfermer|abogad|contad(or|ur[ií]a)|contabilidad|docente|profesor|reclutad|atenci[oó]n\s+al\s+cliente|asesor\s+de\s+ventas|formador)\b/i;

/**
 * Returns a short reason if the title clearly isn't a fit (skip scoring), or
 * null if it should be scored normally.
 */
export function quickRejectByTitle(title: string): string | null {
  if (ALLOW.test(title)) return null;
  const match = DENY.exec(title);
  return match ? `non-matching role ("${match[0].trim()}")` : null;
}
