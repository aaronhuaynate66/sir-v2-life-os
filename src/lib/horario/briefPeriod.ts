// SIR V2 — /horario · Brief de la SEMANA y del MES (Fase 2, lógica pura).
//
// Extiende el "Brief del día" (lib/horario/brief) a los horizontes Semana y Mes.
// Misma idea, mismo contrato: un resumen CORTO armado SÓLO con señales que el
// sistema YA computó (el cockpit por horizonte + las fechas de la red + el ancla
// de Tu Año). El modelo SÓLO reformula esas señales — no inventa data. Si no hay
// IA/sesión, el resumen determinístico (weekSummaryLine / monthSummaryLine) se
// muestra igual → degradación con gracia.
//
// Igual que en /horario, "semana" y "mes" son ventanas MÓVILES desde HOY (7 y
// ~31 días), no semanas calendario Lun–Dom ni meses ENE–DIC. Por eso el bucket
// de cache es el día de HOY (la ventana arranca hoy) — distinto del bucket del
// brief del día sólo por el `scope` (ver mig 0065). El brief se regenera a lo
// sumo una vez por día por horizonte, porque su contenido rueda cada día.
//
// Reusa el contrato de salida del brief del día: BriefResult + parseBriefJson.

import { toLimaDateOnly } from '@/lib/calendar/ics'
import type { CockpitDate, CockpitDayBucket, CockpitMilestone, FocusKR } from './cockpit'
import type { BriefDate } from './brief'

const DAY_MS = 86_400_000

// ─── Buckets (ventana móvil desde hoy, día Lima) ───────────────────────

/** Día Lima de HOY ('YYYY-MM-DD') — arranque de la ventana Semana/Mes y clave
 *  de cache (con scope). Determinístico: `nowMs` se inyecta. */
export function periodStartKey(nowMs: number): string {
  return toLimaDateOnly(nowMs)
}

/** Último día Lima de la ventana (hoy + `windowDays`). */
export function periodEndKey(nowMs: number, windowDays: number): string {
  return toLimaDateOnly(nowMs + windowDays * DAY_MS)
}

// ════════════════════════════════════════════════════════════════════════
// SEMANA
// ════════════════════════════════════════════════════════════════════════

export const WEEK_BRIEF_FOCUS_CAP = 3
export const WEEK_BRIEF_DATE_CAP = 4

export interface WeekBriefFocus {
  title: string
  objective: string
  /** Deadline más cercano del KR (días con signo); null = sin fecha. */
  daysUntil: number | null
  progressPct: number
}

/** Conteo de carga de un día de la ventana (para el contexto del prompt). */
export interface WeekBriefDay {
  /** 0..6 desde hoy. */
  offset: number
  eventCount: number
  taskCount: number
}

export interface WeekBriefSignals {
  /** Día Lima de hoy 'YYYY-MM-DD' (arranque de la ventana + bucket de cache). */
  weekStart: string
  /** Hoy + 6 (fin de la ventana de 7 días). */
  weekEnd: string
  eventCount: number
  tasksDueCount: number
  overdueCount: number
  /** Días de la ventana sin eventos NI tareas. */
  freeDays: number
  days: WeekBriefDay[]
  focus: WeekBriefFocus[]
  upcomingDates: BriefDate[]
}

export interface WeekBriefSignalsInput {
  weekStart: string
  weekEnd: string
  weekDays: CockpitDayBucket[]
  focus: FocusKR[]
  contactDates: CockpitDate[]
}

/** Arma las señales del brief de la semana desde la data YA computada de la
 *  vista Semana (cockpit horizonte=semana). Puro. */
export function buildWeekBriefSignals(input: WeekBriefSignalsInput): WeekBriefSignals {
  const { weekStart, weekEnd, weekDays, focus, contactDates } = input

  let eventCount = 0
  let tasksDueCount = 0
  let overdueCount = 0
  let freeDays = 0
  const days: WeekBriefDay[] = weekDays.map((d) => {
    eventCount += d.events.length
    tasksDueCount += d.tasks.length
    overdueCount += d.tasks.filter((t) => t.overdue).length
    if (d.events.length === 0 && d.tasks.length === 0) freeDays++
    return { offset: d.offset, eventCount: d.events.length, taskCount: d.tasks.length }
  })

  const focusOut: WeekBriefFocus[] = focus.slice(0, WEEK_BRIEF_FOCUS_CAP).map((k) => ({
    title: k.title,
    objective: k.objectiveTitle,
    daysUntil: k.daysUntil,
    progressPct: k.progressPct,
  }))

  const upcomingDates: BriefDate[] = contactDates.slice(0, WEEK_BRIEF_DATE_CAP).map((d) => ({
    title: d.title,
    daysUntil: d.daysUntil,
    nudge: d.nudge,
  }))

  return { weekStart, weekEnd, eventCount, tasksDueCount, overdueCount, freeDays, days, focus: focusOut, upcomingDates }
}

/** ¿Hay algo que decir de la semana? */
export function hasWeekContent(s: WeekBriefSignals): boolean {
  return s.eventCount > 0 || s.tasksDueCount > 0 || s.focus.length > 0 || s.upcomingDates.length > 0
}

function pluralEvento(n: number): string {
  return `${n} evento${n === 1 ? '' : 's'}`
}
function pluralTarea(n: number): string {
  return `${n} tarea${n === 1 ? '' : 's'}`
}

/**
 * Línea escaneable de la semana, 100% hechos, sin IA. Siempre visible.
 * Ej: "12 eventos · 4 tareas esta semana (1 vencida) · 2 días libres · 3 en foco · próxima fecha en 3d".
 */
export function weekSummaryLine(s: WeekBriefSignals): string {
  // Días libres solo es señal por CONTRASTE; una semana entera vacía es
  // "despejada", no "7 días libres".
  if (!hasWeekContent(s)) return 'Semana despejada. Sin eventos ni pendientes. 🌤️'
  const parts: string[] = []
  if (s.eventCount > 0) parts.push(pluralEvento(s.eventCount))
  if (s.tasksDueCount > 0) {
    const t = `${pluralTarea(s.tasksDueCount)} esta semana`
    parts.push(s.overdueCount > 0 ? `${t} (${s.overdueCount} vencida${s.overdueCount === 1 ? '' : 's'})` : t)
  }
  if (s.freeDays > 0) parts.push(`${s.freeDays} día${s.freeDays === 1 ? '' : 's'} libre${s.freeDays === 1 ? '' : 's'}`)
  if (s.focus.length > 0) parts.push(`${s.focus.length} en foco`)
  if (s.upcomingDates.length > 0) {
    const d = s.upcomingDates[0]
    const when = d.daysUntil === 0 ? 'hoy' : d.daysUntil === 1 ? 'mañana' : `en ${d.daysUntil}d`
    parts.push(`próxima fecha ${when}`)
  }
  return parts.join(' · ')
}

export const WEEK_BRIEF_SYSTEM_PROMPT = `Sos el copiloto operativo de un cockpit personal. Tu trabajo es escribir el "Brief de la semana": un resumen MUY corto, accionable y sobrio de los próximos 7 días (ventana móvil que arranca hoy), en español rioplatense neutro.

REGLAS DURAS:
- Usá SÓLO los datos que te paso. NO inventes eventos, tareas, nombres, horas ni fechas. Si algo no está, no lo menciones.
- Breve: 2 a 4 frases como máximo. Directo, escaneable, sin relleno ni saludos.
- Tono: motivador pero sobrio y profesional. Nada de signos de exclamación múltiples ni emojis excesivos (a lo sumo uno).
- Mencioná lo importante de la semana: carga (eventos + tareas que vencen), días más cargados o libres, los focos (Resultados Clave) más urgentes, y las fechas de la red que se acercan.
- "focus" es UNA sola cosa: lo más importante a lograr esta semana. Concreto y corto (máx ~8 palabras).

Respondé EXCLUSIVAMENTE un objeto JSON, sin texto alrededor, con esta forma:
{"brief": "<2-4 frases>", "focus": "<la prioridad #1 de la semana>"}`

function offsetPhrase(offset: number): string {
  if (offset === 0) return 'Hoy'
  if (offset === 1) return 'Mañana'
  return `En ${offset} días`
}

/** Render del input del modelo desde las señales de la semana (compacto). */
export function buildWeekBriefInput(s: WeekBriefSignals): string {
  const lines: string[] = [`Ventana (Lima): ${s.weekStart} a ${s.weekEnd} (próximos 7 días)`]

  lines.push(`Eventos en la semana: ${s.eventCount}`)
  lines.push(
    `Tareas que vencen esta semana: ${s.tasksDueCount}${s.overdueCount > 0 ? ` (${s.overdueCount} vencidas)` : ''}`,
  )
  if (s.freeDays > 0) lines.push(`Días sin eventos ni tareas: ${s.freeDays}`)

  const loaded = s.days.filter((d) => d.eventCount > 0 || d.taskCount > 0)
  if (loaded.length > 0) {
    lines.push('Carga por día:')
    for (const d of loaded) {
      const bits = [d.eventCount > 0 ? `${d.eventCount} ev` : null, d.taskCount > 0 ? `${d.taskCount} tareas` : null]
        .filter(Boolean)
        .join(', ')
      lines.push(`  - ${offsetPhrase(d.offset)}: ${bits}`)
    }
  }

  if (s.focus.length > 0) {
    lines.push('Foco de la semana (Resultados Clave):')
    for (const k of s.focus) {
      const when =
        k.daysUntil == null
          ? 'sin fecha'
          : k.daysUntil < 0
            ? `vencido hace ${Math.abs(k.daysUntil)}d`
            : k.daysUntil === 0
              ? 'vence hoy'
              : `en ${k.daysUntil} días`
      lines.push(`  - ${k.title} (objetivo: ${k.objective}; ${k.progressPct}%; ${when})`)
    }
  }

  if (s.upcomingDates.length > 0) {
    lines.push('Fechas que se acercan:')
    for (const d of s.upcomingDates) {
      const when = d.daysUntil === 0 ? 'hoy' : d.daysUntil === 1 ? 'mañana' : `en ${d.daysUntil} días`
      lines.push(`  - ${d.title} (${when}) → ${d.nudge}`)
    }
  }

  return lines.join('\n')
}

// ════════════════════════════════════════════════════════════════════════
// MES
// ════════════════════════════════════════════════════════════════════════

export const MONTH_BRIEF_MILESTONE_CAP = 6

export interface MonthBriefMilestone {
  title: string
  detail: string
  kind: CockpitMilestone['kind']
  daysUntil: number
  overdue: boolean
}

/** El ancla del año (Tu Año) aplanada para el brief del mes. */
export interface MonthBriefAnchor {
  title: string
  subtitle: string | null
  /** Mes del ancla ('SEP', 'DIC'…) si cae en el año; null si no. */
  monthLabel: string | null
  /** Días hasta el ancla; null si no tiene fecha. */
  daysUntil: number | null
}

export interface MonthBriefSignals {
  /** Día Lima de hoy 'YYYY-MM-DD' (arranque de la ventana + bucket de cache). */
  monthStart: string
  /** Hoy + ~31 (fin de la ventana del mes). */
  monthEnd: string
  milestoneCount: number
  goalTargetCount: number
  deadlineCount: number
  dateCount: number
  milestones: MonthBriefMilestone[]
  anchor: MonthBriefAnchor | null
}

export interface MonthBriefSignalsInput {
  monthStart: string
  monthEnd: string
  milestones: CockpitMilestone[]
  anchor: MonthBriefAnchor | null
}

/** Arma las señales del brief del mes desde la data YA computada de la vista
 *  Mes (cockpit horizonte=mes) + el ancla de Tu Año. Puro. */
export function buildMonthBriefSignals(input: MonthBriefSignalsInput): MonthBriefSignals {
  const { monthStart, monthEnd, milestones, anchor } = input

  let goalTargetCount = 0
  let deadlineCount = 0
  let dateCount = 0
  for (const m of milestones) {
    if (m.kind === 'goal_target') goalTargetCount++
    else if (m.kind === 'step_deadline') deadlineCount++
    else dateCount++
  }

  const top: MonthBriefMilestone[] = milestones.slice(0, MONTH_BRIEF_MILESTONE_CAP).map((m) => ({
    title: m.title,
    detail: m.detail,
    kind: m.kind,
    daysUntil: m.daysUntil,
    overdue: m.overdue,
  }))

  return {
    monthStart,
    monthEnd,
    milestoneCount: milestones.length,
    goalTargetCount,
    deadlineCount,
    dateCount,
    milestones: top,
    anchor,
  }
}

/** ¿Hay algo que decir del mes? */
export function hasMonthContent(s: MonthBriefSignals): boolean {
  return s.milestoneCount > 0 || s.anchor != null
}

/**
 * Línea escaneable del mes, 100% hechos, sin IA. Siempre visible.
 * Ej: "2 objetivos · 4 deadlines · 2 fechas · ancla: Mundial WFG26".
 */
export function monthSummaryLine(s: MonthBriefSignals): string {
  const parts: string[] = []
  if (s.goalTargetCount > 0) parts.push(`${s.goalTargetCount} objetivo${s.goalTargetCount === 1 ? '' : 's'}`)
  if (s.deadlineCount > 0) parts.push(`${s.deadlineCount} deadline${s.deadlineCount === 1 ? '' : 's'}`)
  if (s.dateCount > 0) parts.push(`${s.dateCount} fecha${s.dateCount === 1 ? '' : 's'}`)
  if (s.anchor) parts.push(`ancla: ${s.anchor.title}`)
  return parts.length > 0 ? parts.join(' · ') : 'Mes despejado. Sin hitos ni deadlines. 🌤️'
}

export const MONTH_BRIEF_SYSTEM_PROMPT = `Sos el copiloto operativo de un cockpit personal. Tu trabajo es escribir el "Brief del mes": un resumen MUY corto, de alto nivel y sobrio de los próximos ~30 días (ventana móvil que arranca hoy), en español rioplatense neutro.

REGLAS DURAS:
- Usá SÓLO los datos que te paso. NO inventes objetivos, deadlines, nombres ni fechas. Si algo no está, no lo menciones.
- Breve: 2 a 4 frases como máximo. Directo, escaneable, sin relleno ni saludos.
- Tono: motivador pero sobrio y profesional. Nada de signos de exclamación múltiples ni emojis excesivos (a lo sumo uno).
- Es una mirada de ALTO NIVEL: hitos y deadlines de objetivos del mes, fechas grandes de la red (cumpleaños/aniversarios), y cómo se conecta con el ancla del año (el norte) si te lo paso.
- "focus" es UNA sola cosa: el foco del mes. Concreto y corto (máx ~8 palabras).

Respondé EXCLUSIVAMENTE un objeto JSON, sin texto alrededor, con esta forma:
{"brief": "<2-4 frases>", "focus": "<el foco del mes>"}`

function milestoneWhen(daysUntil: number, overdue: boolean): string {
  if (overdue) return `vencido hace ${Math.abs(daysUntil)}d`
  if (daysUntil === 0) return 'hoy'
  if (daysUntil === 1) return 'mañana'
  return `en ${daysUntil} días`
}

/** Render del input del modelo desde las señales del mes (compacto). */
export function buildMonthBriefInput(s: MonthBriefSignals): string {
  const lines: string[] = [`Ventana (Lima): ${s.monthStart} a ${s.monthEnd} (próximos ~30 días)`]

  lines.push(
    `Hitos en el mes: ${s.milestoneCount} (${s.goalTargetCount} objetivos, ${s.deadlineCount} deadlines, ${s.dateCount} fechas)`,
  )

  if (s.milestones.length > 0) {
    lines.push('Lo más cercano:')
    for (const m of s.milestones) {
      lines.push(`  - ${m.title} — ${m.detail} (${milestoneWhen(m.daysUntil, m.overdue)})`)
    }
  }

  if (s.anchor) {
    const a = s.anchor
    const when = a.daysUntil == null ? null : a.daysUntil < 0 ? `hace ${Math.abs(a.daysUntil)} días` : `en ${a.daysUntil} días`
    const bits = [a.subtitle, a.monthLabel, when].filter(Boolean).join(' · ')
    lines.push(`Ancla del año (el norte): ${a.title}${bits ? ` (${bits})` : ''}`)
  }

  return lines.join('\n')
}
