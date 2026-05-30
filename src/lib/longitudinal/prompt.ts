// SIR V2 — Prompt del resumen longitudinal semanal (Fase 3c).
//
// Genera un resumen ACCIONABLE de la semana con patrones observados sobre
// el historial del usuario: person_logs (ánimo/energía/sueño/dolor/
// interacción), observations (capturas/conversaciones) y memories.
//
// Reusa el scaffolding de #8 (síntesis) / Briefing. Mismos invariantes:
//   - #1 bienestar, NO engagement: la acción sugerida cuida al usuario,
//     jamás induce uso adictivo ni dependencia.
//   - #5 sin decisiones sensibles: prohibido diagnóstico clínico, etiquetas
//     de salud mental, consejo médico. No inventar datos.

export const WEEKLY_SUMMARY_SYSTEM_PROMPT = `Eres el módulo de patrones longitudinales de SIR, un sistema operativo personal centrado en el bienestar.

Tu tarea: a partir del historial reciente del usuario (registros de estado, conversaciones y memorias), escribir un resumen SEMANAL breve y ACCIONABLE que destaque patrones observados.

ESTRUCTURA DE SALIDA (texto plano, exactamente estos 4 bloques, cada uno separado por una línea en blanco, con su etiqueta literal):
Resumen: una sola oración con cómo fue la semana en lo esencial.

Patrones: 2 a 4 observaciones de tendencias (ánimo/energía/sueño, temas recurrentes, ritmo de contacto). Cada observación en su propia línea, empezando con "- ". Basate en los números y textos provistos.

Destacado: 1 a 2 oraciones sobre lo que más marcó la semana (un evento, una conversación, un cambio).

Próxima semana: UNA acción concreta y respetuosa para la semana que viene, orientada al bienestar (descanso, un vínculo a cuidar, un hábito a sostener). Nunca una táctica para "engancharse" más con la app.

REGLAS ESTRICTAS:
- Usá SOLO los datos provistos. No inventes números, eventos ni personas.
- PROHIBIDO: diagnósticos clínicos, etiquetas de salud mental, consejo médico/psicológico, alarmismo.
- Si hay pocos datos, decilo con honestidad y mantené el resumen corto.
- Español neutro, cálido y directo. Sin markdown extra, sin emojis. Respetá las etiquetas "Resumen:", "Patrones:", "Destacado:", "Próxima semana:" tal cual.`

export interface WeeklyLogStat {
  kind: string
  count: number
  avg: number
}
export interface WeeklyObservationLite {
  date: string
  type: string
  summary: string | null
}
export interface WeeklyMemoryLite {
  date: string
  type: string
  content: string
}

export interface WeeklyInputData {
  periodStart: string
  periodEnd: string
  logStats: WeeklyLogStat[]
  observations: WeeklyObservationLite[]
  memories: WeeklyMemoryLite[]
}

const KIND_ES: Record<string, string> = {
  mood: 'ánimo',
  energy: 'energía',
  sleep: 'sueño',
  pain: 'dolor',
  interaction: 'tono de interacción',
}

export function buildWeeklyInput(d: WeeklyInputData): string {
  const lines: string[] = [
    `Período: ${d.periodStart} a ${d.periodEnd} (semana).`,
    '',
    'Registros de estado (person_logs) — promedio 1-5:',
  ]
  if (d.logStats.length === 0) {
    lines.push('  (sin registros esta semana)')
  } else {
    for (const s of d.logStats) {
      lines.push(`  - ${KIND_ES[s.kind] ?? s.kind}: ${s.count} registro(s), promedio ${s.avg.toFixed(1)}/5`)
    }
  }

  lines.push('', `Conversaciones / capturas (${d.observations.length}):`)
  if (d.observations.length === 0) lines.push('  (ninguna)')
  else
    for (const o of d.observations.slice(0, 25)) {
      lines.push(`  - [${o.date} · ${o.type}] ${o.summary ?? '(sin resumen)'}`)
    }

  lines.push('', `Memorias del período (${d.memories.length}):`)
  if (d.memories.length === 0) lines.push('  (ninguna)')
  else
    for (const m of d.memories.slice(0, 25)) {
      lines.push(`  - [${m.date} · ${m.type}] ${m.content}`)
    }

  lines.push('', 'Escribí el resumen semanal con la estructura indicada.')
  return lines.join('\n')
}
