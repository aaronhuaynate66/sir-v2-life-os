// SIR V2 — "Tu trayectoria": el ARCO de largo plazo de tus objetivos (E5, Life
// Direction). Las otras capas de "Tu rumbo" miran el AHORA o el norte del año:
//   - norteDrift  → ¿le prestás ATENCIÓN al norte ahora?
//   - norteMomentum → ¿avanzaste el norte (pasos) en 30 días?
//   - espejoSemanal → coherencia de los últimos 7 días.
//   - lifeThread → la lista cruda de hitos.
// Falta la lectura SOSTENIDA EN EL TIEMPO: de TODO lo que te propusiste en la
// vida, ¿qué terminás, qué soltás, en qué áreas construís y en cuáles aflojás,
// y esa proporción viene mejorando o enfriándose?
//
// Eso es "quién venís siendo" a escala de años — el corazón de la Etapa 5.
//
// PURO + determinístico, `now` inyectable. No inventa ni moraliza: cada número
// sale de un cambio real de estado de un Goal. Soltar/pausar NO es fracaso — el
// copy enmarca los cambios de rumbo como elecciones válidas (mismos invariantes
// anti-culpa que rumboPrompt). Es la base sobre la que la reflexión IA opcional
// (rumbo) puede reformular el patrón, sin inventarlo.
//
// Nota de data: Goal no tiene `completedAt`; usamos `updatedAt` como fecha de
// resolución cuando el estado es completed/abandoned/paused (misma convención
// que lifeThread.ts). Es una aproximación honesta: es la última vez que el
// objetivo cambió, y para un objetivo resuelto ese cambio suele ser su cierre.

import type { Goal, GoalCategory } from '@/types'

export type TrajectoryPattern =
  | 'nascent' // poco recorrido cerrado: todavía no hay arco para leer
  | 'exploring' // muchos frentes abiertos, pocos resueltos
  | 'building' // cerrás bastante más de lo que soltás
  | 'releasing' // soltás más de lo que cerrás
  | 'steady' // equilibrado entre lo que cerrás y lo que soltás

export type TrajectoryMomentum = 'acelera' | 'estable' | 'desacelera' | 'sin_datos'

export interface CategoryArc {
  category: GoalCategory
  set: number
  active: number
  completed: number
  paused: number
  abandoned: number
  /** completed / (completed + abandoned); null si no hay resueltos. */
  followThrough: number | null
}

export interface TrajectoryArc {
  total: number
  active: number
  completed: number
  paused: number
  abandoned: number
  /** completed + abandoned: los objetivos que ya se resolvieron de una u otra forma. */
  resolved: number
  /** completed / resolved (0..1); null si resolved === 0. */
  followThrough: number | null
  /** Completados en la ventana reciente (últimos WINDOW_DAYS). */
  recentCompleted: number
  /** Completados en la ventana PREVIA (mismo largo, justo antes de la reciente). */
  priorCompleted: number
  momentum: TrajectoryMomentum
  pattern: TrajectoryPattern
  /** Áreas de vida con al menos un objetivo, ordenadas por follow-through desc. */
  byCategory: CategoryArc[]
  /** Área con mejor follow-through (≥ MIN_AREA_RESOLVED resueltos); null si ninguna. */
  strongestArea: CategoryArc | null
  /** Área con peor follow-through (≥ MIN_AREA_RESOLVED resueltos); null si ninguna. */
  weakestArea: CategoryArc | null
  message: string
}

const DAY = 86_400_000
/** Ventana de "reciente" para el momentum. Escala de VIDA, no semanal. */
const WINDOW_DAYS = 180
/** Mínimo de objetivos resueltos para leer un patrón (menos = 'nascent'). */
const MIN_RESOLVED = 3
/** Mínimo de resueltos en un área para nombrarla fuerte/débil (evita ruido). */
const MIN_AREA_RESOLVED = 2

const CATEGORY_ES: Record<GoalCategory, string> = {
  financial: 'lo financiero',
  personal: 'lo personal',
  relational: 'los vínculos',
  health: 'la salud',
  career: 'la carrera',
  spiritual: 'lo espiritual',
  creative: 'lo creativo',
}

/** Nombre legible de un área para el copy. */
export function categoryLabelEs(c: GoalCategory): string {
  return CATEGORY_ES[c] ?? c
}

function parse(iso: string | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

function pct(ratio: number): number {
  return Math.round(ratio * 100)
}

function computeCategoryArc(category: GoalCategory, goals: Goal[]): CategoryArc {
  let set = 0
  let active = 0
  let completed = 0
  let paused = 0
  let abandoned = 0
  for (const g of goals) {
    set += 1
    if (g.status === 'active') active += 1
    else if (g.status === 'completed') completed += 1
    else if (g.status === 'paused') paused += 1
    else if (g.status === 'abandoned') abandoned += 1
  }
  const resolved = completed + abandoned
  return {
    category,
    set,
    active,
    completed,
    paused,
    abandoned,
    followThrough: resolved > 0 ? completed / resolved : null,
  }
}

export function buildTrajectoryArc(goals: Goal[], now: Date = new Date()): TrajectoryArc {
  const valid = (goals ?? []).filter((g) => g && (g.title ?? '').trim().length > 0)

  let active = 0
  let completed = 0
  let paused = 0
  let abandoned = 0
  for (const g of valid) {
    if (g.status === 'active') active += 1
    else if (g.status === 'completed') completed += 1
    else if (g.status === 'paused') paused += 1
    else if (g.status === 'abandoned') abandoned += 1
  }
  const total = valid.length
  const resolved = completed + abandoned
  const followThrough = resolved > 0 ? completed / resolved : null

  // Momentum: completados por fecha de resolución (updatedAt) en la ventana
  // reciente vs la previa del mismo largo.
  const nowMs = now.getTime()
  let recentCompleted = 0
  let priorCompleted = 0
  for (const g of valid) {
    if (g.status !== 'completed') continue
    const t = parse(g.updatedAt)
    if (t === null) continue
    const age = nowMs - t
    if (age < 0) continue
    if (age <= WINDOW_DAYS * DAY) recentCompleted += 1
    else if (age <= 2 * WINDOW_DAYS * DAY) priorCompleted += 1
  }
  const momentum: TrajectoryMomentum =
    recentCompleted === 0 && priorCompleted === 0
      ? 'sin_datos'
      : recentCompleted > priorCompleted
        ? 'acelera'
        : recentCompleted < priorCompleted
          ? 'desacelera'
          : 'estable'

  // Arco por área de vida.
  const byCat = new Map<GoalCategory, Goal[]>()
  for (const g of valid) {
    const arr = byCat.get(g.category) ?? []
    arr.push(g)
    byCat.set(g.category, arr)
  }
  const byCategory: CategoryArc[] = [...byCat.entries()]
    .map(([cat, gs]) => computeCategoryArc(cat, gs))
    .sort((a, b) => {
      // Follow-through desc; las áreas sin resueltos (null) al final.
      const fa = a.followThrough
      const fb = b.followThrough
      if (fa === null && fb === null) return b.set - a.set
      if (fa === null) return 1
      if (fb === null) return -1
      if (fb !== fa) return fb - fa
      return b.completed + b.abandoned - (a.completed + a.abandoned)
    })

  const rankable = byCategory.filter(
    (c) => c.followThrough !== null && c.completed + c.abandoned >= MIN_AREA_RESOLVED,
  )
  const strongestArea = rankable.length > 0 ? rankable[0] : null
  const weakestArea =
    rankable.length >= 2 && rankable[rankable.length - 1].followThrough !== strongestArea?.followThrough
      ? rankable[rankable.length - 1]
      : null

  // Patrón.
  let pattern: TrajectoryPattern
  if (resolved < MIN_RESOLVED) {
    pattern = active >= 4 ? 'exploring' : 'nascent'
  } else if (followThrough !== null && followThrough >= 0.6) {
    pattern = 'building'
  } else if (followThrough !== null && followThrough <= 0.34) {
    pattern = 'releasing'
  } else {
    pattern = 'steady'
  }

  const message = buildMessage({
    pattern,
    total,
    active,
    completed,
    abandoned,
    resolved,
    followThrough,
    momentum,
    strongestArea,
    weakestArea,
  })

  return {
    total,
    active,
    completed,
    paused,
    abandoned,
    resolved,
    followThrough,
    recentCompleted,
    priorCompleted,
    momentum,
    pattern,
    byCategory,
    strongestArea,
    weakestArea,
    message,
  }
}

interface MessageParts {
  pattern: TrajectoryPattern
  total: number
  active: number
  completed: number
  abandoned: number
  resolved: number
  followThrough: number | null
  momentum: TrajectoryMomentum
  strongestArea: CategoryArc | null
  weakestArea: CategoryArc | null
}

function buildMessage(p: MessageParts): string {
  if (p.total === 0) {
    return 'Todavía no fijaste objetivos. Tu trayectoria se empieza a dibujar cuando te propongas —y cierres o sueltes— tus primeras metas.'
  }
  const ftTxt = p.followThrough !== null ? `${pct(p.followThrough)}%` : null

  let core: string
  switch (p.pattern) {
    case 'nascent':
      core = `Fijaste ${p.total} objetivo${p.total === 1 ? '' : 's'} y todavía cerraste poco (${p.completed} completado${p.completed === 1 ? '' : 's'}). Hay poco recorrido resuelto para leer un arco: se va a ir dibujando a medida que algunos cierren o los sueltes.`
      break
    case 'exploring':
      core = `Tienes ${p.active} frentes abiertos y ${p.resolved} objetivo${p.resolved === 1 ? '' : 's'} ya resuelto${p.resolved === 1 ? '' : 's'}. Estás en modo exploración: abres mucho y todavía cerraste poco. El arco se lee mejor cuando algunos frentes se cierren o se suelten a propósito.`
      break
    case 'building':
      core = `De los ${p.resolved} objetivos que ya resolviste, cerraste ${p.completed} (${ftTxt}). Vienes siendo alguien que termina lo que empieza.`
      break
    case 'releasing':
      core = `De los ${p.resolved} objetivos que ya resolviste, soltaste ${p.abandoned} y cerraste ${p.completed} (${ftTxt} completados). Soltar no es fracasar —a veces es corregir el rumbo—; vale mirar si viene de una elección o de un desgaste.`
      break
    case 'steady':
    default:
      core = `De los ${p.resolved} objetivos que ya resolviste, cerraste ${p.completed} y soltaste ${p.abandoned} (${ftTxt} completados). Terminas y sueltas en proporciones parecidas.`
      break
  }

  const extras: string[] = []
  if (p.strongestArea && p.weakestArea) {
    extras.push(
      `Donde más cierras es ${categoryLabelEs(p.strongestArea.category)}; donde más sueltas, ${categoryLabelEs(p.weakestArea.category)}.`,
    )
  } else if (p.strongestArea) {
    extras.push(`Donde más constancia muestras es en ${categoryLabelEs(p.strongestArea.category)}.`)
  }
  if (p.pattern === 'building' || p.pattern === 'releasing' || p.pattern === 'steady') {
    if (p.momentum === 'acelera') extras.push('Y vienes cerrando más seguido que antes.')
    else if (p.momentum === 'desacelera') extras.push('Últimamente vienes cerrando menos que antes.')
  }

  return [core, ...extras].join(' ')
}

/** Resumen compacto de una línea para pasarle el arco a la reflexión IA (rumbo):
 *  números reales que el LLM puede REFORMULAR, no inventar. null si no hay arco
 *  con sustancia todavía (nascent sin resueltos). */
export function trajectorySummaryLine(arc: TrajectoryArc): string | null {
  if (arc.total === 0) return null
  if (arc.resolved === 0 && arc.active === 0) return null
  const parts: string[] = []
  parts.push(
    `objetivos: ${arc.active} activos, ${arc.completed} completados, ${arc.paused} pausados, ${arc.abandoned} soltados`,
  )
  if (arc.followThrough !== null) {
    parts.push(`follow-through ${pct(arc.followThrough)}% (${arc.completed}/${arc.resolved} resueltos cerrados)`)
  }
  if (arc.strongestArea) parts.push(`más constancia en ${categoryLabelEs(arc.strongestArea.category)}`)
  if (arc.weakestArea) parts.push(`más sueltas en ${categoryLabelEs(arc.weakestArea.category)}`)
  if (arc.momentum === 'acelera') parts.push('cerrando más seguido que antes')
  else if (arc.momentum === 'desacelera') parts.push('cerrando menos que antes')
  return parts.join('; ')
}
