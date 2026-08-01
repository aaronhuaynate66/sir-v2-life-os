// SIR V2 — "Tus estaciones": los CAPÍTULOS de tu vida (E5, Life Direction).
//
// El resto de "Tu rumbo" mira agregados (trajectoryArc: cuántos cerrás/soltás) o
// el AHORA (norteDrift, espejoSemanal). Lo que falta es la CONTINUIDAD NARRATIVA
// por temporadas: la vida no avanza parejo, se mueve por RACHAS temáticas. Hubo
// un tramo que fue sobre la mudanza y el Mundial; antes, otro que fue sobre la
// carrera. Nombrar esos capítulos —cuándo empezaron, sobre qué giraron— es leer
// el rumbo a escala de estaciones, no de metas sueltas.
//
// Cómo se detecta (PURO + determinístico, `now` inyectable):
//   1. De cada objetivo salen EVENTOS fechados reales: se propuso (createdAt) y,
//      si se resolvió, su cierre/pausa/soltada (updatedAt). Misma convención de
//      fecha que lifeThread.ts / trajectoryArc.ts.
//   2. Se ordenan y se PARTEN en estaciones por SILENCIO: si entre dos eventos
//      hay más de GAP_DAYS sin que muevas ningún objetivo, ahí cierra un capítulo
//      y arranca otro. Una racha de actividad = una estación.
//   3. El TEMA de cada estación sale de los objetivos que la habitan (sus
//      títulos y áreas), ordenados por saliencia (ancla > prioridad > actividad).
//
// No inventa ni moraliza: cada estación, su fecha y su tema salen de cambios
// reales en Goals. Pausar/soltar objetivos es parte del capítulo, no un fracaso.
// Es la base sobre la que la reflexión IA opcional (rumbo) puede REFORMULAR el
// hilo de capítulos —con las etiquetas y fechas reales—, sin inventarlas.

import type { Goal, GoalCategory, GoalPriority } from '@/types'
import { categoryLabelEs } from '@/lib/self/trajectoryArc'

const DAY = 86_400_000
/** Silencio (sin mover ningún objetivo) que separa un capítulo del siguiente. A
 *  escala de vida: dos meses sin tocar una meta = cambió la estación. */
const GAP_DAYS = 60
/** Título recortado para las etiquetas de tema. */
const MAX_TITLE = 32
/** Cuántos objetivos como mucho nombran el tema de una estación. */
const MAX_THEME_GOALS = 2

const PRIORITY_RANK: Record<GoalPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

type SeasonEventKind = 'set' | 'done' | 'paused' | 'let_go'

interface SeasonEvent {
  time: number
  kind: SeasonEventKind
  goalId: string
  title: string
  category: GoalCategory
  priority: GoalPriority
  isAnchor: boolean
}

export interface SeasonGoalRef {
  id: string
  title: string
  category: GoalCategory
  isAnchor: boolean
  /** Cuántos eventos de este objetivo cayeron en la estación (proxy de foco). */
  events: number
}

export interface SeasonCategoryWeight {
  category: GoalCategory
  count: number
}

export interface LifeSeason {
  id: string
  /** ISO date-only (YYYY-MM-DD) del primer y último evento de la estación. */
  startDate: string
  endDate: string
  spanDays: number
  /** La estación más reciente Y todavía en curso (último evento < GAP_DAYS de hoy). */
  isCurrent: boolean
  set: number
  done: number
  paused: number
  letGo: number
  /** Áreas de vida que dominaron la estación, por cantidad de eventos, desc. */
  categories: SeasonCategoryWeight[]
  /** Objetivos que habitaron la estación, por saliencia (ancla > prioridad > foco). */
  goals: SeasonGoalRef[]
  /** Tema legible: los títulos de los objetivos salientes ("Mudanza + Mundial"). */
  label: string
  /** Una línea humana de la estación (rango + tema). */
  summary: string
}

export interface LifeSeasons {
  /** Estaciones de la más RECIENTE a la más antigua. */
  seasons: LifeSeason[]
  /** La estación en curso, o null si vienes en una pausa entre capítulos. */
  current: LifeSeason | null
  message: string
}

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

function parse(iso: string | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** "julio" si es el año de referencia; "julio de 2025" si no. */
function monthLabel(ms: number, refYear: number): string {
  const d = new Date(ms)
  const m = MONTHS_ES[d.getUTCMonth()]
  const y = d.getUTCFullYear()
  return y === refYear ? m : `${m} de ${y}`
}

function truncateTitle(t: string): string {
  const clean = t.trim()
  return clean.length <= MAX_TITLE ? clean : `${clean.slice(0, MAX_TITLE - 1).trimEnd()}…`
}

function collectEvents(goals: Goal[]): SeasonEvent[] {
  const out: SeasonEvent[] = []
  for (const g of goals ?? []) {
    if (!g) continue
    const title = (g.title ?? '').trim()
    if (!title) continue
    const base = {
      goalId: g.id,
      title,
      category: g.category,
      priority: g.priority,
      isAnchor: Boolean(g.isAnchor),
    }
    const setT = parse(g.createdAt)
    if (setT !== null) out.push({ time: setT, kind: 'set', ...base })
    const resKind: SeasonEventKind | null =
      g.status === 'completed' ? 'done' : g.status === 'paused' ? 'paused' : g.status === 'abandoned' ? 'let_go' : null
    if (resKind) {
      const resT = parse(g.updatedAt)
      // Solo si el cierre es DISTINTO (posterior) a la creación: si no, es el
      // mismo instante y no aporta un segundo evento.
      if (resT !== null && (setT === null || resT > setT)) {
        out.push({ time: resT, kind: resKind, ...base })
      }
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

function buildSeason(events: SeasonEvent[], nowMs: number, refYear: number): LifeSeason {
  const start = events[0].time
  const end = events[events.length - 1].time
  let set = 0
  let done = 0
  let paused = 0
  let letGo = 0
  const catCount = new Map<GoalCategory, number>()
  const goalMap = new Map<string, SeasonGoalRef & { rank: number; last: number }>()

  for (const e of events) {
    if (e.kind === 'set') set += 1
    else if (e.kind === 'done') done += 1
    else if (e.kind === 'paused') paused += 1
    else if (e.kind === 'let_go') letGo += 1
    catCount.set(e.category, (catCount.get(e.category) ?? 0) + 1)
    const existing = goalMap.get(e.goalId)
    if (existing) {
      existing.events += 1
      if (e.time > existing.last) existing.last = e.time
    } else {
      goalMap.set(e.goalId, {
        id: e.goalId,
        title: e.title,
        category: e.category,
        isAnchor: e.isAnchor,
        events: 1,
        rank: PRIORITY_RANK[e.priority],
        last: e.time,
      })
    }
  }

  const categories: SeasonCategoryWeight[] = [...catCount.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)

  // Saliencia del objetivo dentro del capítulo: ancla primero, luego prioridad,
  // luego cuántos eventos aportó (foco), luego el más reciente.
  const goals: SeasonGoalRef[] = [...goalMap.values()]
    .sort((a, b) => {
      if (a.isAnchor !== b.isAnchor) return a.isAnchor ? -1 : 1
      if (a.rank !== b.rank) return a.rank - b.rank
      if (b.events !== a.events) return b.events - a.events
      return b.last - a.last
    })
    .map(({ id, title, category, isAnchor, events: ev }) => ({ id, title, category, isAnchor, events: ev }))

  const themeTitles = goals.slice(0, MAX_THEME_GOALS).map((g) => truncateTitle(g.title))
  const label =
    themeTitles.length > 0
      ? themeTitles.join(' + ')
      : categories.length > 0
        ? categoryLabelEs(categories[0].category)
        : 'sin tema claro'

  const isCurrent = nowMs - end <= GAP_DAYS * DAY
  const startLabel = monthLabel(start, refYear)
  const endLabel = monthLabel(end, refYear)
  const rangePhrase =
    startLabel === endLabel
      ? `en ${startLabel}`
      : isCurrent
        ? `desde ${startLabel}`
        : `${startLabel}–${endLabel}`
  const summary = `${capitalize(rangePhrase)}: ${label}.`

  return {
    id: `season_${isoDay(start)}`,
    startDate: isoDay(start),
    endDate: isoDay(end),
    spanDays: Math.max(0, Math.round((end - start) / DAY)),
    isCurrent,
    set,
    done,
    paused,
    letGo,
    categories,
    goals,
    label,
    summary,
  }
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

/**
 * Segmenta la vida en estaciones temáticas desde los objetivos. PURO.
 *
 * @param goals todos los objetivos (con o sin resolver)
 * @param now   "hoy" inyectable para determinismo
 */
export function buildLifeSeasons(goals: Goal[], now: Date = new Date()): LifeSeasons {
  const nowMs = now.getTime()
  const refYear = now.getFullYear()
  const events = collectEvents(goals)

  if (events.length === 0) {
    return {
      seasons: [],
      current: null,
      message:
        'Todavía no hay capítulos que dibujar. Se van formando a medida que pones y mueves objetivos: cada racha de actividad se vuelve una estación de tu vida.',
    }
  }

  // Partir por silencio: gap > GAP_DAYS entre eventos consecutivos.
  const groups: SeasonEvent[][] = []
  let cur: SeasonEvent[] = [events[0]]
  for (let i = 1; i < events.length; i += 1) {
    const gap = events[i].time - events[i - 1].time
    if (gap > GAP_DAYS * DAY) {
      groups.push(cur)
      cur = []
    }
    cur.push(events[i])
  }
  groups.push(cur)

  // Más reciente primero.
  const seasons = groups.map((g) => buildSeason(g, nowMs, refYear)).sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
  const current = seasons.find((s) => s.isCurrent) ?? null

  const message = buildMessage(seasons, current)
  return { seasons, current, message }
}

function buildMessage(seasons: LifeSeason[], current: LifeSeason | null): string {
  if (seasons.length === 0) return ''
  // Un solo tramo de actividad: todavía sin arco de capítulos que contrastar.
  if (seasons.length === 1) {
    const only = seasons[0]
    return current
      ? `Estás en tu primer capítulo. ${only.summary}`
      : `Tu único capítulo hasta ahora. ${only.summary}`
  }

  const parts: string[] = []
  if (current) {
    parts.push(`Tu capítulo actual gira en torno a ${current.label}.`)
    const prev = seasons.find((s) => s !== current)
    if (prev) parts.push(`Antes: ${lower(prev.summary)}`)
  } else {
    parts.push(`Tu último capítulo fue sobre ${seasons[0].label}.`)
    parts.push('Ahora vienes en una pausa entre capítulos: hace un tiempo que no mueves un objetivo.')
  }
  return parts.join(' ')
}

function lower(s: string): string {
  return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1)
}

/** Resumen compacto de una línea de los capítulos para la reflexión IA (rumbo):
 *  etiquetas y fechas REALES que el LLM puede REFORMULAR, no inventar. null si no
 *  hay arco de capítulos con sustancia (0 ó 1 estación fina). */
export function seasonsSummaryLine(seasons: LifeSeasons): string | null {
  const s = seasons.seasons
  if (s.length === 0) return null
  const top = s.slice(0, 3)
  const parts = top.map((se) => {
    const when = se.startDate === se.endDate ? se.startDate : `${se.startDate}→${se.endDate}`
    const tag = se.isCurrent ? ' (actual)' : ''
    return `${when}${tag}: ${se.label}`
  })
  return `capítulos, del más reciente al más antiguo — ${parts.join('; ')}`
}
