// SIR V2 — Lectura estratégica de una empresa/holding (escalón 3b). La IA lee
// el hub (tu gente ahí, sus vínculos, objetivos en juego, estructura) y devuelve
// una lectura BREVE: dónde tenés palancas, en quién apoyarte, qué está en juego.
//
// LÍNEA (misma que el briefing relacional): inteligencia táctica/estratégica
// legítima, apoyada en vínculos GENUINOS e intereses reales. PROHIBIDO sugerir
// engaño, coerción, o usar a alguien en contra de su propio interés. La empresa
// es contexto/tablero, no una persona con la que "se tiene un vínculo".

export const STRATEGIC_SYSTEM_PROMPT = `Eres el módulo de lectura estratégica de SIR sobre una organización (empresa o grupo).

Recibís: el nombre del grupo/empresa, la gente que el usuario conoce ahí (con su importancia y último contacto), los objetivos activos del usuario ligados a esa gente, y la estructura (empresas del grupo o el holding al que pertenece).

Tu tarea: devolver UNA lectura breve y útil para que el usuario navegue su situación en esa organización — dónde tiene aliados o palancas reales, en quién conviene invertir el vínculo, qué objetivo está en juego, qué movimiento concreto tiene sentido.

Devolvé EXCLUSIVAMENTE un objeto JSON (sin markdown):
{ "insight": "2 a 5 oraciones en español neutro, directo y sobrio" }

REGLAS ESTRICTAS:
- Usá SOLO la información provista. No inventes personas, cargos, vínculos ni hechos.
- Inteligencia estratégica legítima: leer el tablero, intereses compartidos, vías de influencia, apoyarse en vínculos REALES. Esto NO es manipulación.
- PROHIBIDO sugerir engaño, presión, coerción, o usar a alguien en contra de su propio interés. Si una jugada requeriría mentir o dañar a alguien, no la propongas.
- La organización es CONTEXTO/tablero, no una persona: nada de "tu vínculo con la empresa" en sentido afectivo.
- Si hay poca información, decilo y mantené la lectura corta. Tono de asesor sobrio, sin inflar.`

export interface StrategicHubPerson {
  name: string
  organization?: string | null
  importance?: number
  lastContact?: string | null
  activeGoalTitle?: string
}

export interface StrategicInput {
  label: string
  level: 'grupo' | 'empresa'
  parentLabel?: string | null
  subCompanies?: string[]
  people: StrategicHubPerson[]
  goals: string[]
}

export function buildStrategicInput(input: StrategicInput): string {
  const lines: string[] = [
    `${input.level === 'grupo' ? 'Grupo/holding' : 'Empresa'}: ${input.label}`,
  ]
  if (input.parentLabel) lines.push(`Pertenece a: ${input.parentLabel}`)
  if (input.subCompanies && input.subCompanies.length > 0) {
    lines.push(`Empresas del grupo donde conocés gente: ${input.subCompanies.join(', ')}`)
  }
  lines.push('', `Tu gente ahí (${input.people.length}):`)
  if (input.people.length === 0) lines.push('  (ninguna)')
  else
    for (const p of input.people) {
      const bits: string[] = []
      if (p.organization) bits.push(p.organization)
      if (typeof p.importance === 'number') bits.push(`importancia ${p.importance}/10`)
      if (p.lastContact) bits.push(`últ. contacto ${p.lastContact}`)
      if (p.activeGoalTitle) bits.push(`objetivo activo: "${p.activeGoalTitle}"`)
      lines.push(`  - ${p.name}${bits.length ? ' — ' + bits.join(' · ') : ''}`)
    }
  lines.push('', `Objetivos activos ligados a esta organización (${input.goals.length}):`)
  if (input.goals.length === 0) lines.push('  (ninguno)')
  else for (const g of input.goals) lines.push(`  - ${g}`)
  lines.push('', 'Devolvé la lectura estratégica en el JSON especificado.')
  return lines.join('\n')
}

export function parseStrategicInsight(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null
  const a = raw.indexOf('{')
  const b = raw.lastIndexOf('}')
  if (a !== -1 && b > a) {
    try {
      const parsed = JSON.parse(raw.slice(a, b + 1)) as { insight?: unknown }
      if (typeof parsed.insight === 'string' && parsed.insight.trim()) return parsed.insight.trim()
    } catch {
      /* fallthrough */
    }
  }
  return null
}
