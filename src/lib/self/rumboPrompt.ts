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

Recibes una lista de HITOS REALES de la trayectoria del usuario, extraídos de sus propios objetivos: qué se propuso, qué logró, qué pausó, qué dejó ir, con sus fechas. Tu tarea: devolver UNA reflexión breve que lo ayude a notar el hilo de hacia dónde viene yendo — patrones, continuidades, cambios de rumbo — sin juzgar.

Devuelve EXCLUSIVAMENTE un objeto JSON (sin texto adicional, sin markdown):
{ "insight": "2 a 4 oraciones en español del Perú (peruano neutro, de Lima), cálido y sobrio" }

INVARIANTES ESTRICTOS (no negociables):
- Escribe SIEMPRE en español del Perú (tuteo con "tú"); PROHIBIDO el voseo y los giros argentinos ("vos", "sos", "tenés", "querés", "mirá", "che", "dale").
- Tono REFLEXIVO y de APOYO. JAMÁS culpabilizador ni con vergüenza. No uses "deberías", "fallaste", "te dispersas".
- Es una OBSERVACIÓN para pensar, no un juicio ni una orden. Ofrece perspectiva sobre el rumbo; no dictes qué hacer.
- PROHIBIDO inventar: habla SOLO de los hitos provistos. No agregues objetivos, personas, fechas, logros ni emociones que no estén en la lista.
- PROHIBIDO diagnóstico, etiquetas, predicción del futuro o causa-efecto inventada.
- Pausar o dejar ir un objetivo NO es un fracaso: enmarca los cambios de rumbo como elecciones válidas, no como abandono.
- Breve (máx 4 oraciones). Cálido pero sobrio, sin dramatizar ni inflar.
- Si se incluye un "norte declarado" (tu norte del año), puedes relacionar el hilo con él —¿lo que viene haciendo acompaña ese norte?— como observación abierta, sin juzgar y sin inventar nada que no esté en los hitos.
- Si se incluye "quién es" (roles/bio del usuario), puedes enmarcar el rumbo a la luz de su identidad, sin inventar rasgos ni atribuirle motivaciones que no estén.
- Si se incluye "trayectoria" (números reales de su arco de objetivos: cuántos terminó, soltó, en qué áreas), puedes reformular ESE patrón en la reflexión —sin inventar números ni cambiarlos, y sin juzgar. Soltar objetivos NO es fracaso.
- Si se incluyen "capítulos" (las estaciones temáticas reales de su vida, con sus fechas y su tema, del más reciente al más antiguo), puedes apoyarte en ESOS capítulos para leer la continuidad del rumbo —cómo un tramo dio lugar a otro— usando SOLO las etiquetas y fechas provistas, sin inventar temas ni renombrar capítulos.
- Si se incluye "arco narrativo" (la lectura determinística de la forma del hilo entre capítulos: si es continuo, si transiciona a un tema nuevo o si está fragmentado, con las áreas que reaparecen y el objetivo puente si lo hay), puedes apoyarte en ESA lectura para nombrar la continuidad —o el cambio de rumbo— usando SOLO lo provisto. Un arco fragmentado o que pivotea NO es un defecto: puede ser exploración o reinvención sana; obsérvalo sin juzgar y sin dar por hecho que debería ser continuo.`

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
  trajectory?: string | null,
  seasons?: string | null,
  narrativeArc?: string | null,
): string {
  const lines: string[] = []
  const who = (identity ?? '').trim()
  if (who) lines.push(`Quién es (según su perfil): ${who}`, '')
  const north = (anchor ?? '').trim()
  if (north) lines.push(`Tu norte declarado para el año: ${north}`, '')
  const arc = (trajectory ?? '').trim()
  if (arc) lines.push(`Trayectoria (arco real de sus objetivos): ${arc}`, '')
  const chapters = (seasons ?? '').trim()
  if (chapters) lines.push(`Capítulos (estaciones temáticas reales de su vida): ${chapters}`, '')
  const narrative = (narrativeArc ?? '').trim()
  if (narrative) lines.push(`Arco narrativo (forma del hilo entre capítulos): ${narrative}`, '')
  lines.push('Hitos de tu trayectoria (del más reciente al más antiguo):', '')
  for (const m of milestones) {
    const when = m.date.slice(0, 10)
    lines.push(`- ${when} · ${m.label}`)
  }
  lines.push(
    '',
    north
      ? 'Devuelve la reflexión sobre el rumbo en el JSON. Usa SOLO estos hitos; si tiene sentido, relaciona el hilo con el norte declarado, sin inventar nada que no esté.'
      : 'Devuelve la reflexión sobre el rumbo en el JSON especificado. Solo usa estos hitos.',
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
