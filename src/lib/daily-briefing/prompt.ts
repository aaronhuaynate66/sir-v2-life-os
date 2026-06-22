// SIR V2 — Prompt del Briefing diario (Fase 5: IA básica).
//
// Briefing accionable de "hoy" sobre el estado actual del usuario: objetivos
// activos, señales sin resolver, estado reciente (person_logs), interacciones
// recientes y fase lunar del día. Efímero (no se persiste), generado on-demand
// desde Mission Control (/panel). Reusa el scaffolding de #8/Briefing/3c.
//
// INVARIANTES:
//   - #1 bienestar, NO engagement: la sugerencia cuida al usuario y sus
//     vínculos, jamás induce uso adictivo ni urgencia artificial.
//   - #5 sin decisiones sensibles: prohibido diagnóstico clínico/médico. No
//     inventar datos. Si hay poco contexto, decirlo y ser breve.

export const DAILY_BRIEFING_SYSTEM_PROMPT = `Eres el módulo de briefing diario de SIR, un sistema operativo personal centrado en el bienestar. Sos la voz de "Mission Control": ayudás al usuario a empezar el día con foco y calma.

A partir del contexto actual (objetivos, señales, estado reciente, interacciones, fase lunar), escribí un briefing breve y ACCIONABLE para HOY.

ESTRUCTURA DE SALIDA (texto plano, exactamente estos 3 bloques, cada uno separado por una línea en blanco, con su etiqueta literal):
Hoy: una sola oración con la lectura del día (cómo viene el estado / el clima general).

En foco: 1 a 3 cosas que merecen atención hoy (un objetivo en riesgo, una señal urgente, un vínculo a cuidar). Cada una en su propia línea empezando con "- ". Basate SOLO en el contexto provisto.

Sugerencia: UNA acción concreta y realista para hoy, orientada al bienestar (un paso de un objetivo, un descanso, un mensaje a alguien). Nunca una táctica de urgencia artificial ni para "usar más la app".

REGLAS ESTRICTAS:
- Usá SOLO los datos provistos. No inventes objetivos, señales, personas ni eventos.
- PROHIBIDO: diagnósticos clínicos, etiquetas de salud mental, consejo médico, alarmismo.
- Si hay poco contexto, decilo con honestidad y mantené el briefing corto.
- Si una pareja o vínculo MUY cercano está cerca de su período, podés anticiparlo con delicadeza (ej. cuidar el tono, dar espacio, estar más presente) — observacional y empático, NUNCA clínico, determinista ni como excusa para minimizar lo que sienta. No lo menciones para vínculos no cercanos.
- Español neutro, cálido y directo. Sin markdown extra, sin emojis. Respetá las etiquetas "Hoy:", "En foco:", "Sugerencia:" tal cual.`

export interface DailyGoalLite {
  title: string
  priority: string
  progress: number
  nextAction: string | null
}
export interface DailySignalLite {
  content: string
  urgency: string
  suggestedAction: string | null
}
export interface DailyLogStat {
  kind: string
  count: number
  avg: number
}
export interface DailyObservationLite {
  date: string
  type: string
  summary: string | null
}
export interface DailyMomentLite {
  person: string
  title: string
  /** 'vencido' | 'hoy' | 'proximo' | 'abierto' (sin seguimiento) */
  due: string
}
export interface DailyCycleLite {
  person: string
  phase: string
  /** Días hasta el próximo período (0 = hoy). */
  daysUntilNextPeriod: number
}

export interface DailyBriefingInput {
  today: string
  lunarPhase: string
  goals: DailyGoalLite[]
  signals: DailySignalLite[]
  logStats: DailyLogStat[]
  observations: DailyObservationLite[]
  moments: DailyMomentLite[]
  cycles: DailyCycleLite[]
}

const KIND_ES: Record<string, string> = {
  mood: 'ánimo',
  energy: 'energía',
  sleep: 'sueño',
  pain: 'dolor',
  interaction: 'tono de interacción',
}

export function buildDailyInput(d: DailyBriefingInput): string {
  const lines: string[] = [`Fecha: ${d.today}`, `Fase lunar de hoy: ${d.lunarPhase}`, '']

  lines.push(`Objetivos activos (${d.goals.length}):`)
  if (d.goals.length === 0) lines.push('  (ninguno)')
  else
    for (const g of d.goals.slice(0, 10)) {
      lines.push(
        `  - [${g.priority}] ${g.title} — progreso ${g.progress}%` +
          (g.nextAction ? ` — próximo paso: ${g.nextAction}` : ''),
      )
    }

  lines.push('', `Señales sin resolver (${d.signals.length}):`)
  if (d.signals.length === 0) lines.push('  (ninguna)')
  else
    for (const s of d.signals.slice(0, 10)) {
      lines.push(
        `  - [${s.urgency}] ${s.content}` + (s.suggestedAction ? ` — sugerido: ${s.suggestedAction}` : ''),
      )
    }

  lines.push('', 'Estado reciente (person_logs, promedio 1-5):')
  if (d.logStats.length === 0) lines.push('  (sin registros recientes)')
  else
    for (const st of d.logStats) {
      lines.push(`  - ${KIND_ES[st.kind] ?? st.kind}: ${st.avg.toFixed(1)}/5 (n=${st.count})`)
    }

  lines.push('', `Interacciones recientes (${d.observations.length}):`)
  if (d.observations.length === 0) lines.push('  (ninguna)')
  else
    for (const o of d.observations.slice(0, 15)) {
      lines.push(`  - [${o.date} · ${o.type}] ${o.summary ?? '(sin resumen)'}`)
    }

  lines.push('', `Decisiones / momentos abiertos (${d.moments.length}):`)
  if (d.moments.length === 0) lines.push('  (ninguno)')
  else
    for (const m of d.moments.slice(0, 12)) {
      const tag = m.due === 'vencido' ? 'SEGUIMIENTO VENCIDO' : m.due === 'hoy' ? 'SEGUIMIENTO HOY' : m.due === 'proximo' ? 'a seguir pronto' : 'abierto'
      lines.push(`  - [${tag}] ${m.person}: ${m.title}`)
    }

  if (d.cycles.length > 0) {
    lines.push('', 'Ciclo de vínculos cercanos (solo anticipación, NO médico):')
    for (const c of d.cycles.slice(0, 6)) {
      const when = c.daysUntilNextPeriod <= 0 ? 'su período es hoy/ya empezó'
        : c.daysUntilNextPeriod === 1 ? 'le vendría el período mañana'
        : `le vendría el período en ~${c.daysUntilNextPeriod} días`
      lines.push(`  - ${c.person}: fase ${c.phase}, ${when}`)
    }
  }

  lines.push('', 'Escribí el briefing de hoy con la estructura indicada.')
  return lines.join('\n')
}
