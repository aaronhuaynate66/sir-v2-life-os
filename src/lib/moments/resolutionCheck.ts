// SIR V2 — Cruce chat → temas abiertos: ¿el chat reciente ya resolvió un
// "momento/decisión" que sigue ABIERTO? (Fricción de Aaron 17/07: el tema del
// seguro seguía abierto aunque los resultados ya habían llegado por WhatsApp.)
//
// CONSERVADOR a propósito: SIR SUGIERE cerrar (con la evidencia textual), NUNCA
// cierra solo — la IA asiste, no controla; un falso positivo no debe borrar un
// tema real. El prompt exige evidencia CLARA y citar la frase. PURO (prompt +
// parser sin I/O) → testeable.

export interface OpenMomentLite {
  id: string
  title: string
  detail: string | null
}

export interface ChatLine {
  /** 'Aaron' o el nombre de la persona. */
  who: string
  /** 'YYYY-MM-DD'. */
  date: string
  text: string
}

export interface ResolutionVerdict {
  momentId: string
  resolved: boolean
  /** Frase textual del chat que lo sostiene (vacío si resolved=false). */
  evidence: string
  confidence: 'high' | 'medium' | 'low'
}

export const RESOLUTION_SYSTEM_PROMPT = `Eres un módulo de SIR que revisa si un TEMA ABIERTO con una persona YA se resolvió, mirando el chat reciente. Escribe SIEMPRE en español del Perú (tuteo con "tú"); PROHIBIDO el voseo argentino.

REGLAS DURAS:
- Marca resolved:true SOLO si el chat reciente tiene evidencia CLARA de que ese tema se cerró, se concretó o avanzó a resuelto. Cita la frase textual del chat en "evidence".
- Si no hay evidencia clara en el chat, resolved:false y evidence vacío. NO inventes, no infieras de más: ante la duda, resolved:false.
- confidence: "high" solo con una frase inequívoca; "medium" si es probable pero no textual; "low" si es débil (en ese caso mejor resolved:false).
- Devuelve SOLO un array JSON, sin texto alrededor, un objeto por cada tema abierto que te paso:
  [{"momentId":"<id>","resolved":true|false,"evidence":"<frase del chat o vacío>","confidence":"high|medium|low"}]`

/** Arma el mensaje de usuario: temas abiertos (con su id) + transcript reciente. PURO. */
export function buildResolutionInput(moments: OpenMomentLite[], name: string, lines: ChatLine[]): string {
  const temas = moments
    .map((m, i) => `${i + 1}. [id: ${m.id}] ${m.title}${m.detail ? ` — ${m.detail}` : ''}`)
    .join('\n')
  const chat = lines
    .map((l) => `[${l.date}] ${l.who}: ${l.text}`)
    .join('\n')
  return `Temas ABIERTOS con ${name}:\n${temas}\n\nChat reciente con ${name} (cronológico):\n${chat || '(sin mensajes recientes)'}`
}

/** Parsea el array JSON del modelo, tolerante, y lo acota a los momentIds válidos. PURO. */
export function parseResolutionVerdicts(raw: string, validIds: readonly string[]): ResolutionVerdict[] {
  const s = raw.indexOf('[')
  const e = raw.lastIndexOf(']')
  if (s < 0 || e <= s) return []
  let arr: unknown
  try { arr = JSON.parse(raw.slice(s, e + 1)) } catch { return [] }
  if (!Array.isArray(arr)) return []
  const valid = new Set(validIds)
  const out: ResolutionVerdict[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const momentId = typeof r.momentId === 'string' ? r.momentId : ''
    if (!valid.has(momentId)) continue
    const confidence = r.confidence === 'high' || r.confidence === 'medium' || r.confidence === 'low' ? r.confidence : 'low'
    out.push({
      momentId,
      resolved: r.resolved === true,
      evidence: typeof r.evidence === 'string' ? r.evidence.slice(0, 300) : '',
      confidence,
    })
  }
  return out
}

/** Filtra a las sugerencias que vale mostrar: resueltas con confianza no-baja. PURO. */
export function suggestedResolutions(verdicts: ResolutionVerdict[]): ResolutionVerdict[] {
  return verdicts.filter((v) => v.resolved && (v.confidence === 'high' || v.confidence === 'medium') && v.evidence.trim().length > 0)
}
