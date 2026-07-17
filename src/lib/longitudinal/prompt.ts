// SIR V2 — Prompt del resumen longitudinal semanal (Fase 3c).
//
// Genera un resumen ACCIONABLE de la semana con patrones observados sobre
// el historial del usuario: person_logs (ánimo/energía/sueño/dolor/
// interacción), observations (capturas/conversaciones) y memories.
//
// Reusa el scaffolding de #8 (síntesis) / Briefing. Mismos invariantes:
//   - #1 bienestar, NO engagement: la acción sugerida cuida al usuario,
//     jamás induce uso adictivo ni dependencia.
//   - #5 hipótesis ≠ diagnóstico confirmado: permitido detectar patrones,
//     predisposiciones y riesgos con evidencia; sin diagnóstico clínico cerrado.

export const WEEKLY_SUMMARY_SYSTEM_PROMPT = `Eres el módulo de patrones longitudinales de SIR, un sistema operativo personal centrado en el bienestar.

Tu tarea: a partir del historial reciente del usuario (registros de estado, conversaciones y memorias), escribir un resumen SEMANAL breve y ACCIONABLE que destaque patrones observados.

ESTRUCTURA DE SALIDA (texto plano, exactamente estos 4 bloques, cada uno separado por una línea en blanco, con su etiqueta literal):
Resumen: una sola oración con cómo fue la semana en lo esencial.

Patrones: 2 a 4 observaciones de tendencias (ánimo/energía/sueño, temas recurrentes, ritmo de contacto). Cada observación en su propia línea, empezando con "- ". Básate en los números y textos provistos.

Destacado: 1 a 2 oraciones sobre lo que más marcó la semana (un evento, una conversación, un cambio).

Próxima semana: UNA acción concreta y respetuosa para la semana que viene, orientada al bienestar (descanso, un vínculo a cuidar, un hábito a sostener). Nunca una táctica para "engancharse" más con la app.

CORRELACIÓN LUNAR / CICLO (opcional, solo si aparece en los datos):
- Si el "Contexto lunar" o el "Contexto de ciclo" muestran una coincidencia CLARA entre el estado (ánimo/energía/sueño) y una fase lunar o de ciclo, menciónala en Patrones como señal fuerte u observación contextual. Puede ser central si los datos lo sostienen, pero no la presentes como causa única.
- Si NO hay una señal clara (pocos datos, sin variación), NO la menciones. Mejor omitir que forzar.
- PROHIBIDO: astrología prescriptiva, certeza falsa o reducir la conducta de otra persona solo a su fase. El ciclo es señal habilitada, no identidad total.

REGLAS ESTRICTAS:
- Usa SOLO los datos provistos. No inventes números, eventos ni personas.
- Permitido: hipótesis de riesgo, predisposición o patrón compatible si aparece en los datos, con lenguaje tentativo y confianza implícita por cantidad de registros.
- PROHIBIDO: presentar diagnósticos clínicos como hechos confirmados, consejo médico/psicológico, alarmismo.
- Si hay pocos datos, dilo con honestidad y mantén el resumen corto.
- Escribe SIEMPRE en español del Perú (tuteo con "tú"), cálido y directo; PROHIBIDO el voseo y los giros argentinos ("vos", "sos", "tenés", "querés", "mirá", "che", "dale"). Sin markdown extra, sin emojis. Respeta las etiquetas "Resumen:", "Patrones:", "Destacado:", "Próxima semana:" tal cual.`

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

/** Avg de un estado (mood/energy/sleep/pain) agrupado por fase lunar. */
export interface WeeklyLunarStat {
  phase: string
  kind: string
  count: number
  avg: number
}
/** Fase de ciclo de una persona durante la semana (solo personas con
 *  cycle_start_date) + cuántos logs de la persona cayeron en la ventana. */
export interface WeeklyCycleNote {
  person: string
  phase: string
  cycleDay: number
  logCount: number
}

export interface WeeklyInputData {
  periodStart: string
  periodEnd: string
  logStats: WeeklyLogStat[]
  observations: WeeklyObservationLite[]
  memories: WeeklyMemoryLite[]
  /** Fases lunares que atravesó la semana (etiquetas, deduplicadas). */
  lunarPhasesInWeek: string[]
  /** Estado promedio por fase lunar × kind (para detectar coincidencias). */
  lunarStats: WeeklyLunarStat[]
  /** Notas de ciclo por persona con datos de ciclo. */
  cycleNotes: WeeklyCycleNote[]
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

  // Contexto lunar: solo si hay estados registrados con los que cruzar.
  lines.push('', 'Contexto lunar:')
  if (d.lunarPhasesInWeek.length > 0) {
    lines.push(`  La semana atravesó: ${d.lunarPhasesInWeek.join(', ')}.`)
  }
  if (d.lunarStats.length === 0) {
    lines.push('  (sin registros de estado para cruzar con la fase lunar)')
  } else {
    lines.push('  Estado promedio por fase lunar (kind: fase = promedio/5, n):')
    for (const s of d.lunarStats) {
      lines.push(`  - ${KIND_ES[s.kind] ?? s.kind}: ${s.phase} = ${s.avg.toFixed(1)}/5 (n=${s.count})`)
    }
  }

  // Contexto de ciclo: solo personas con datos de ciclo.
  lines.push('', 'Contexto de ciclo:')
  if (d.cycleNotes.length === 0) {
    lines.push('  (ninguna persona con datos de ciclo registró actividad esta semana)')
  } else {
    for (const c of d.cycleNotes) {
      lines.push(`  - ${c.person}: fase ${c.phase} (día ${c.cycleDay} del ciclo), ${c.logCount} registro(s) en la semana`)
    }
  }

  lines.push('', 'Escribe el resumen semanal con la estructura indicada.')
  return lines.join('\n')
}
