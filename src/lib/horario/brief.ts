// SIR V2 — /horario · Brief del día (Fase 2), lógica pura.
//
// El "Brief del día" es un resumen CORTO y escaneable de cómo se ve hoy, armado
// SÓLO con señales que el sistema YA tiene (no inventa data): los eventos del
// calendario, las tareas que vencen hoy, los huecos libres calculados, las
// fechas de la red que se acercan y las relaciones a atender. La narrativa
// motivadora la pone el modelo (capa IA, on-demand), pero acá vive todo lo
// determinístico: el armado de las señales y el resumen-baseline sin IA.
//
// Patrón = alignment/narrative: el CLIENTE computa las señales con datos reales
// y el server sólo las REFORMULA. Por eso el brief se apoya en hechos, no en
// invención. Si no hay IA/sesión, el resumen determinístico (briefSummaryLine)
// igual se muestra → degradación con gracia.
//
// PURO + determinístico. Reusa lo ya construido: la DayTimeline + DayPlan
// (lib/horario/dayPlan) ya traen eventos, tareas con hora y huecos; las fechas
// vienen de contactDatesInRange y las relaciones del scoring de daily-actions.

import type { DayTimeline } from '@/lib/calendar/timeline'
import type { CockpitDate, CockpitTask } from './cockpit'
import type { DayPlan, GapRowItem } from './dayPlan'
import { msToLimaHHMM, formatDurationMin } from './limaClock'

/** Cuántas señales de cada tipo entran al brief (lo demás es ruido). */
export const BRIEF_TASK_CAP = 5
export const BRIEF_GAP_CAP = 4
export const BRIEF_DATE_CAP = 3
export const BRIEF_RELATION_CAP = 3

// ─── Señales del brief ─────────────────────────────────────────────────

export interface BriefEvent {
  title: string
  /** 'HH:MM' Lima (vacío si all-day). */
  time: string
}

export interface BriefTask {
  title: string
  objective: string
  overdue: boolean
  priority?: 'low' | 'med' | 'high'
}

export interface BriefGap {
  /** 'HH:MM' Lima. */
  from: string
  to: string
  /** Etiqueta corta ("2h", "1h 30m"). */
  duration: string
  minutes: number
}

export interface BriefDate {
  title: string
  daysUntil: number
  nudge: string
}

export interface BriefRelation {
  name: string
  headline: string
  urgency: 'high' | 'medium' | 'low'
}

export interface BriefSignals {
  /** Día Lima 'YYYY-MM-DD' (clave de cache + contexto del prompt). */
  date: string
  eventCount: number
  firstEvent?: BriefEvent
  lastEvent?: BriefEvent
  allDayTitles: string[]
  tasksDueCount: number
  overdueCount: number
  tasks: BriefTask[]
  gaps: BriefGap[]
  upcomingDates: BriefDate[]
  relations: BriefRelation[]
  /** Sobrecarga del día, si el timeline la marcó (busy/overloaded). */
  overload?: { level: string; reason: string }
}

export interface BriefSignalsInput {
  timeline: DayTimeline
  plan: DayPlan
  contactDates: CockpitDate[]
  /** Relaciones a atender (subset del scoring de daily-actions). Opcional. */
  relations?: BriefRelation[]
}

// ─── Armado de señales (puro) ──────────────────────────────────────────

/** Eventos CON hora del timeline, ordenados por inicio (el timeline ya viene
 *  ordenado, pero no asumimos nada). */
function timedEvents(timeline: DayTimeline): BriefEvent[] {
  return [...timeline.blocks]
    .sort((a, b) => a.startMs - b.startMs)
    .map((b) => ({ title: b.event.title, time: msToLimaHHMM(b.startMs) }))
}

function gapToBrief(g: GapRowItem): BriefGap {
  return {
    from: msToLimaHHMM(g.startMs),
    to: msToLimaHHMM(g.endMs),
    duration: formatDurationMin(g.minutes),
    minutes: g.minutes,
  }
}

/**
 * Arma las señales del brief desde la data YA computada de la vista Día. Las
 * tareas salen de las que vencen hoy (con o sin hora): las con hora ya están en
 * `plan.rows`, las sin hora en `plan.untimedTasks` — el brief las cuenta todas.
 */
export function buildBriefSignals(input: BriefSignalsInput): BriefSignals {
  const { timeline, plan, contactDates, relations = [] } = input

  const events = timedEvents(timeline)
  const gaps: BriefGap[] = plan.rows
    .filter((r): r is GapRowItem => r.type === 'gap')
    .map(gapToBrief)
    .slice(0, BRIEF_GAP_CAP)

  // Tareas de hoy: las con hora (filas 'task') + las sin hora (untimedTasks).
  const timedTasks: CockpitTask[] = plan.rows
    .filter((r) => r.type === 'task')
    .map((r) => (r as { task: CockpitTask }).task)
  const allTasks: CockpitTask[] = [...timedTasks, ...plan.untimedTasks]
  const overdueCount = allTasks.filter((t) => t.overdue).length
  const tasks: BriefTask[] = allTasks.slice(0, BRIEF_TASK_CAP).map((t) => ({
    title: t.title,
    objective: t.objectiveTitle,
    overdue: t.overdue,
    priority: t.priority,
  }))

  const upcomingDates: BriefDate[] = contactDates
    .slice(0, BRIEF_DATE_CAP)
    .map((d) => ({ title: d.title, daysUntil: d.daysUntil, nudge: d.nudge }))

  const rels: BriefRelation[] = relations.slice(0, BRIEF_RELATION_CAP)

  const signals: BriefSignals = {
    date: timeline.dateKey,
    eventCount: events.length,
    allDayTitles: timeline.allDay.map((e) => e.title),
    tasksDueCount: allTasks.length,
    overdueCount,
    tasks,
    gaps,
    upcomingDates,
    relations: rels,
  }
  if (events.length > 0) {
    signals.firstEvent = events[0]
    signals.lastEvent = events[events.length - 1]
  }
  if (timeline.overload.level !== 'ok') {
    signals.overload = { level: timeline.overload.level, reason: timeline.overload.reason }
  }
  return signals
}

/** ¿Hay algo que decir? Sin eventos, tareas, fechas ni relaciones no vale la
 *  pena pedir un brief (ni mostrar el resumen). */
export function hasBriefContent(s: BriefSignals): boolean {
  return (
    s.eventCount > 0 ||
    s.allDayTitles.length > 0 ||
    s.tasksDueCount > 0 ||
    s.upcomingDates.length > 0 ||
    s.relations.length > 0
  )
}

// ─── Resumen determinístico (baseline sin IA) ──────────────────────────

function pluralEvento(n: number): string {
  return `${n} evento${n === 1 ? '' : 's'}`
}
function pluralTarea(n: number): string {
  return `${n} tarea${n === 1 ? '' : 's'}`
}
function pluralHueco(n: number): string {
  return `${n} hueco${n === 1 ? '' : 's'} libre${n === 1 ? '' : 's'}`
}

/**
 * Una línea escaneable hecha 100% de hechos, sin IA. Se muestra SIEMPRE (aunque
 * falte la API key o el modelo falle) como baseline del brief.
 * Ej: "3 eventos · 2 tareas vencen · 2 huecos libres · próxima fecha en 11d".
 */
export function briefSummaryLine(s: BriefSignals): string {
  const parts: string[] = []
  if (s.eventCount > 0) parts.push(pluralEvento(s.eventCount))
  if (s.tasksDueCount > 0) {
    const t = `${pluralTarea(s.tasksDueCount)} vence${s.tasksDueCount === 1 ? '' : 'n'} hoy`
    parts.push(s.overdueCount > 0 ? `${t} (${s.overdueCount} vencida${s.overdueCount === 1 ? '' : 's'})` : t)
  }
  if (s.gaps.length > 0) parts.push(pluralHueco(s.gaps.length))
  if (s.upcomingDates.length > 0) {
    const d = s.upcomingDates[0]
    const when = d.daysUntil === 0 ? 'hoy' : d.daysUntil === 1 ? 'mañana' : `en ${d.daysUntil}d`
    parts.push(`próxima fecha ${when}`)
  }
  if (s.relations.length > 0) {
    parts.push(`${s.relations.length} por contactar`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'Día despejado. Sin pendientes ni eventos. 🌤️'
}

// ─── Capa IA: prompt + parser ──────────────────────────────────────────

export const BRIEF_SYSTEM_PROMPT = `Sos el copiloto operativo de un cockpit personal. Tu trabajo es escribir el "Brief del día": un resumen MUY corto, accionable y sobrio del día de hoy, en español rioplatense neutro.

REGLAS DURAS:
- Usá SÓLO los datos que te paso. NO inventes eventos, tareas, nombres, horas ni fechas. Si algo no está, no lo menciones.
- Breve: 2 a 4 frases como máximo. Directo, escaneable, sin relleno ni saludos.
- Tono: motivador pero sobrio y profesional. Nada de signos de exclamación múltiples ni emojis excesivos (a lo sumo uno).
- Mencioná lo importante: cantidad de eventos y reuniones clave, tareas que vencen, huecos libres concretos (con su hora), fechas que se acercan y a quién atender.
- "focus" es UNA sola cosa: lo más importante a lograr hoy. Concreto y corto (máx ~8 palabras).

Respondé EXCLUSIVAMENTE un objeto JSON, sin texto alrededor, con esta forma:
{"brief": "<2-4 frases>", "focus": "<la prioridad #1 de hoy>"}`

/** Render del input del modelo desde las señales (compacto y legible). */
export function buildBriefInput(s: BriefSignals): string {
  const lines: string[] = [`Fecha (hoy, Lima): ${s.date}`]

  lines.push(`Eventos del calendario hoy: ${s.eventCount}`)
  if (s.allDayTitles.length > 0) lines.push(`Todo el día: ${s.allDayTitles.join(', ')}`)
  if (s.firstEvent) lines.push(`Primer evento: ${s.firstEvent.time} ${s.firstEvent.title}`)
  if (s.lastEvent && s.eventCount > 1) lines.push(`Último evento: ${s.lastEvent.time} ${s.lastEvent.title}`)
  if (s.overload) lines.push(`Carga del día: ${s.overload.reason}`)

  if (s.tasksDueCount > 0) {
    lines.push(`Tareas que vencen hoy: ${s.tasksDueCount}${s.overdueCount > 0 ? ` (${s.overdueCount} vencidas)` : ''}`)
    for (const t of s.tasks) {
      const flags = [t.overdue ? 'vencida' : null, t.priority === 'high' ? 'prioridad alta' : null]
        .filter(Boolean)
        .join(', ')
      lines.push(`  - ${t.title} (objetivo: ${t.objective}${flags ? `; ${flags}` : ''})`)
    }
  }

  if (s.gaps.length > 0) {
    lines.push('Huecos libres:')
    for (const g of s.gaps) lines.push(`  - ${g.from}–${g.to} (${g.duration})`)
  }

  if (s.upcomingDates.length > 0) {
    lines.push('Fechas que se acercan:')
    for (const d of s.upcomingDates) {
      const when = d.daysUntil === 0 ? 'hoy' : d.daysUntil === 1 ? 'mañana' : `en ${d.daysUntil} días`
      lines.push(`  - ${d.title} (${when}) → ${d.nudge}`)
    }
  }

  if (s.relations.length > 0) {
    lines.push('Relaciones a atender:')
    for (const r of s.relations) lines.push(`  - ${r.name}: ${r.headline}`)
  }

  return lines.join('\n')
}

export interface BriefResult {
  brief: string
  focus: string
}

/** Parser tolerante de la respuesta del modelo. Usa extractJsonObject (mismo
 *  helper del repo) y degrada: si falta `focus`, devuelve brief solo. */
export function parseBriefJson(
  raw: string,
  extract: (s: string) => Record<string, unknown> | null,
): BriefResult | null {
  const obj = extract(raw)
  if (!obj) return null
  const brief = typeof obj.brief === 'string' ? obj.brief.trim() : ''
  if (!brief) return null
  const focus = typeof obj.focus === 'string' ? obj.focus.trim() : ''
  return { brief, focus }
}
