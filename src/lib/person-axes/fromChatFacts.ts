// SIR V2 — Eje profesional desde los FACTS del chat (BUG-006). PURO.
//
// El eje profesional (person_profile_axes.professional_text) solo se llenaba desde
// una captura de LinkedIn. Pero el import de chat ya extrae `facts` que incluyen
// trabajo (ej. "trabaja en la notaría Rosalía Mejía", "horario 8:30-6:30"). Este
// helper arma un eje profesional a partir de esos facts cuando NO hay LinkedIn, para
// que el dato no quede huérfano. Honesto: rotula "Del chat" (es inferencia de la
// conversación, no un perfil declarado).

const WORK_RE = /\b(trabaj|notar[ií]a|oficina|empresa|horario|jefe|jefa|colega|compañer|cargo|empleo|labor|marketing|puesto|sueldo|carrera|estudi|maestr[ií]a|profesi|ascens|renunci|contrat|freelance|negocio|emprend)/i

/** Arma un eje profesional a partir de los facts del chat. null si no hay ninguno
 *  relacionado al trabajo. */
export function professionalAxisFromFacts(facts: unknown): string | null {
  if (!Array.isArray(facts)) return null
  const work = facts
    .filter((f): f is string => typeof f === 'string' && f.trim().length > 0 && WORK_RE.test(f))
    .map((f) => f.trim().replace(/\s+/g, ' '))
  if (!work.length) return null
  const uniq = [...new Set(work)].slice(0, 5)
  return `Del chat: ${uniq.join(' · ')}.`
}
