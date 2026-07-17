// SIR V2 — Espejo de Narrativa / Arquetipo (Motor #4, Jung hacia adentro).
// Recibe los HITOS REALES de la trayectoria (los mismos de "Tu rumbo") y le pide
// al LLM que NOMBRE el arquetipo que Aaron está VIVIENDO y el que le HACE
// TENSIÓN, con evidencia de sus hitos, y cierre con la pregunta de autoría:
// ¿es la historia que eliges? Auto-conocimiento, NO propaganda. No inventa.

export interface ArquetipoMilestoneInput {
  label: string
  date: string
  kind: string
}

export interface ArquetipoResult {
  archetype: string
  tension: string
  reflection: string
}

export const ARQUETIPO_SYSTEM_PROMPT = `Eres el módulo "Espejo de arquetipo" de SIR. Usas el marco de arquetipos junguianos (Héroe, Rebelde, Sabio, Cuidador/Protector, Explorador, Gobernante, Creador, Mago, Amante, Inocente, Huérfano, Bufón) como ESPEJO de auto-conocimiento, no como etiqueta fija ni horóscopo.

Recibes HITOS REALES de la trayectoria del usuario (qué se propuso, logró, pausó, dejó ir; subas y bajas de vínculos; eventos) y, si está, su norte declarado. Tu tarea: nombrar la HISTORIA que está viviendo.

Devuelve EXCLUSIVAMENTE un objeto JSON (sin markdown, sin texto extra):
{
  "archetype": "El arquetipo DOMINANTE en una o dos palabras (ej. 'El Héroe')",
  "tension": "El arquetipo que le hace CONTRAPESO/tensión, en una o dos palabras (ej. 'El Protector')",
  "reflection": "3 a 4 oraciones en español del Perú (peruano neutro, de Lima), sobrias: por qué ese arquetipo según SUS hitos (cita uno o dos concretos), dónde choca con el otro, y CIERRA con la pregunta '¿es la historia que eliges, o la que te maneja?'"
}

INVARIANTES:
- Escribe SIEMPRE en español del Perú (tuteo con "tú"); PROHIBIDO el voseo y los giros argentinos ("vos", "sos", "tenés", "querés", "mirá", "che", "dale").
- Habla SOLO de los hitos provistos. No inventes logros, personas, fechas ni motivaciones.
- Es un espejo para pensar, NO un diagnóstico ni una orden. Sin "deberías".
- Sobrio, sin dramatizar ni adular. Honesto antes que complaciente.
- El arquetipo es una lente, no una jaula: deja claro que es revisable.`

export function buildArquetipoInput(
  milestones: ArquetipoMilestoneInput[],
  anchor?: string | null,
  identity?: string | null,
): string {
  const lines: string[] = []
  const who = (identity ?? '').trim()
  if (who) lines.push(`Quién es (según su perfil): ${who}`, '')
  const north = (anchor ?? '').trim()
  if (north) lines.push(`Su norte declarado del año: ${north}`, '')
  lines.push('Hitos de su trayectoria (del más reciente al más antiguo):', '')
  for (const m of milestones) lines.push(`- ${m.date.slice(0, 10)} · ${m.label}`)
  lines.push('', 'Devuelve el JSON {archetype, tension, reflection}. Usa SOLO estos hitos.')
  return lines.join('\n')
}

export function parseArquetipo(raw: string): ArquetipoResult | null {
  if (!raw || typeof raw !== 'string') return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    const p = JSON.parse(raw.slice(start, end + 1)) as Partial<ArquetipoResult>
    const archetype = typeof p.archetype === 'string' ? p.archetype.trim() : ''
    const tension = typeof p.tension === 'string' ? p.tension.trim() : ''
    const reflection = typeof p.reflection === 'string' ? p.reflection.trim() : ''
    if (!archetype || !reflection) return null
    return { archetype, tension, reflection }
  } catch { return null }
}
