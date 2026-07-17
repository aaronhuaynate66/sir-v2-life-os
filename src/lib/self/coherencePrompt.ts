// SIR V2 — Prompt + parser de la reflexión de "Coherencia declarado ↔ hecho"
// (E5, Narrative Intelligence). La IA NO decide la coherencia: recibe la SÍNTESIS
// ya computada por computeLifeCoherence (determinística) y sólo la REFORMULA en
// una reflexión breve. El veredicto se apoya en números reales, no en invención.
//
// INVARIANTES (guardrails éticos SIR: "la IA asiste, no controla" + anti-culpa):
//   - Reflexivo y de APOYO. NUNCA culpabilizador, moralizante ni con vergüenza.
//   - Sin diagnóstico, sin predicción, sin causa-efecto inventada.
//   - Habla SOLO de los números/señales provistos. No inventa objetivos ni cifras.
//   - Soltar o repriorizar es una ELECCIÓN VÁLIDA, no una incoherencia moral.
//   - Es una invitación a mirar, revisable y descartable. El usuario decide.

export const COHERENCE_NARRATIVE_SYSTEM_PROMPT = `Eres el módulo "Coherencia" de SIR, un sistema operativo personal centrado en el bienestar y el sentido.

Recibes una SÍNTESIS ya calculada del usuario: qué declaró que le importa (su norte del año y sus prioridades) y dónde cayó realmente su actividad (pasos completados de sus objetivos), como TENDENCIA en el tiempo. Tu tarea: devolver UNA reflexión breve que lo ayude a mirar la BRECHA entre lo que dice que quiere y lo que viene haciendo —si converge hacia su norte o se aleja— sin juzgar.

Devuelve EXCLUSIVAMENTE un objeto JSON (sin texto adicional, sin markdown):
{ "insight": "2 a 4 oraciones en español del Perú (peruano neutro, de Lima), cálido y sobrio" }

INVARIANTES ESTRICTOS (no negociables):
- Escribe SIEMPRE en español del Perú (tuteo con "tú"); PROHIBIDO el voseo y los giros argentinos ("vos", "sos", "tenés", "querés", "mirá", "che", "dale").
- Tono REFLEXIVO y de APOYO. JAMÁS culpabilizador ni con vergüenza. No uses "deberías", "fallaste", "te dispersas", "estás mal".
- Es una OBSERVACIÓN para pensar, no un juicio ni una orden. Ofrece perspectiva; no dictes qué hacer.
- PROHIBIDO inventar: habla SOLO de los números y señales provistos. No agregues objetivos, personas, áreas, cifras ni emociones que no estén.
- PROHIBIDO diagnóstico, etiquetas, predicción del futuro o causa-efecto inventada.
- Que tu actividad caiga fuera de lo declarado NO es un fracaso: puede ser un cambio de prioridades a propósito. Enmarca la brecha como algo para mirar —"¿quieres que tus prioridades declaradas reflejen dónde va tu energía, o al revés?"—, nunca como abandono ni incoherencia moral.
- Puedes relacionar la actividad con el norte declarado como observación abierta, usando SOLO los datos provistos.
- Breve (máx 4 oraciones). Cálido pero sobrio, sin dramatizar ni inflar.`

export interface CoherenceReflectionInput {
  /** La línea de síntesis de computeLifeCoherence (coherenceSummaryLine). */
  coherence: string
  /** El norte declarado del año, si hay. */
  anchor?: string | null
  /** Quién es (roles/bio del perfil de identidad), opcional. */
  identity?: string | null
}

/** Arma el mensaje de usuario desde la síntesis ya computada (determinística). */
export function buildCoherenceInput(input: CoherenceReflectionInput): string {
  const lines: string[] = []
  const who = (input.identity ?? '').trim()
  if (who) lines.push(`Quién es (según su perfil): ${who}`, '')
  const north = (input.anchor ?? '').trim()
  if (north) lines.push(`Su norte declarado para el año: ${north}`, '')
  lines.push('Síntesis de coherencia declarado ↔ hecho (números reales, ya calculados):', '')
  lines.push(input.coherence.trim())
  lines.push(
    '',
    'Devuelve la reflexión sobre la coherencia en el JSON especificado. Usa SOLO estos datos; no inventes cifras ni objetivos. Recuerda: repriorizar es una elección válida, no un fracaso.',
  )
  return lines.join('\n')
}

/** Parsea la respuesta del LLM a un insight string (tolerante). */
export function parseCoherenceNarrative(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { insight?: unknown }
      if (typeof parsed.insight === 'string' && parsed.insight.trim().length > 0) {
        return parsed.insight.trim()
      }
    } catch {
      // fallback al texto crudo
    }
  }
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}
