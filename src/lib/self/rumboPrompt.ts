// SIR V2 — Prompt + parser de la reflexión de "Tu rumbo" (Narrative Intelligence
// Capa 2). La IA NO inventa el hilo: recibe los HITOS REALES ya armados por
// buildLifeThread (Capa 1, determinística) y sólo los REFORMULA en una reflexión
// breve sobre la trayectoria. El veredicto se apoya en datos, no en invención.
//
// INVARIANTES (principio #3 "la IA asiste, no controla" + filtro paz/objetivos):
//   - Reflexivo y de APOYO. NUNCA culpabilizador, moralizante ni con vergüenza.
//   - Sin diagnóstico, sin predicción, sin causa-efecto inventada.
//   - Habla SOLO de los hitos provistos. No inventa objetivos, fechas ni emociones.
//   - Es una invitación a mirar, revisable y descartable. El usuario decide.

export const RUMBO_NARRATIVE_SYSTEM_PROMPT = `Eres el módulo "Tu rumbo" de SIR, un sistema operativo personal centrado en el bienestar y el sentido.

Recibís una lista de HITOS REALES de la trayectoria del usuario, extraídos de sus propios objetivos: qué se propuso, qué logró, qué pausó, qué dejó ir, con sus fechas. Tu tarea: devolver UNA reflexión breve que lo ayude a notar el hilo de hacia dónde viene yendo — patrones, continuidades, cambios de rumbo — sin juzgar.

Devolvé EXCLUSIVAMENTE un objeto JSON (sin texto adicional, sin markdown):
{ "insight": "2 a 4 oraciones en español neutro, cálido y sobrio" }

INVARIANTES ESTRICTOS (no negociables):
- Tono REFLEXIVO y de APOYO. JAMÁS culpabilizador ni con vergüenza. No uses "deberías", "fallaste", "te dispersás".
- Es una OBSERVACIÓN para pensar, no un juicio ni una orden. Ofrecé perspectiva sobre el rumbo; no dictes qué hacer.
- PROHIBIDO inventar: hablá SOLO de los hitos provistos. No agregues objetivos, personas, fechas, logros ni emociones que no estén en la lista.
- PROHIBIDO diagnóstico, etiquetas, predicción del futuro o causa-efecto inventada.
- Pausar o dejar ir un objetivo NO es un fracaso: enmarcá los cambios de rumbo como elecciones válidas, no como abandono.
- Breve (máx 4 oraciones). Cálido pero sobrio, sin dramatizar ni inflar.
- Si se incluye un "norte declarado" (tu norte del año), podés relacionar el hilo con él —¿lo que viene haciendo acompaña ese norte?— como observación abierta, sin juzgar y sin inventar nada que no esté en los hitos.
- Si se incluye "quién es" (roles/bio del usuario), podés enmarcar el rumbo a la luz de su identidad, sin inventar rasgos ni atribuirle motivaciones que no estén.`

export interface RumboMilestoneInput {
  label: string
  date: string
  kind: string
}

/** Arma el mensaje de usuario desde los hitos ya computados (Capa 1). */
export function buildRumboInput(
  milestones: RumboMilestoneInput[],
  anchor?: string | null,
  identity?: string | null,
): string {
  const lines: string[] = []
  const who = (identity ?? '').trim()
  if (who) lines.push(`Quién es (según su perfil): ${who}`, '')
  const north = (anchor ?? '').trim()
  if (north) lines.push(`Tu norte declarado para el año: ${north}`, '')
  lines.push('Hitos de tu trayectoria (del más reciente al más antiguo):', '')
  for (const m of milestones) {
    const when = m.date.slice(0, 10)
    lines.push(`- ${when} · ${m.label}`)
  }
  lines.push(
    '',
    north
      ? 'Devolvé la reflexión sobre el rumbo en el JSON. Usá SOLO estos hitos; si tiene sentido, relacioná el hilo con el norte declarado, sin inventar nada que no esté.'
      : 'Devolvé la reflexión sobre el rumbo en el JSON especificado. Solo usá estos hitos.',
  )
  return lines.join('\n')
}

/** Parsea la respuesta del LLM a un insight string (tolerante). */
export function parseRumboNarrative(raw: string): string | null {
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
