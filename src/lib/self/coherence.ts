// SIR V2 — "Coherencia declarado ↔ hecho" (E5, Life Direction). La SÍNTESIS a
// escala de VIDA: de todo lo que decís que te importa (tu norte + tus prioridades
// declaradas), ¿tu actividad REAL lo acompaña, o el grueso de lo que hacés cae en
// otra parte? Y esa proporción, ¿viene convergiendo hacia tu norte o alejándose?
//
// Qué la hace DISTINTA de lo que ya existe (reusa, no reimplementa):
//   - alignment engine (por-objetivo): cruza UN objetivo con las señales de las
//     personas vinculadas. Esto es agregado a nivel VIDA, no por objetivo.
//   - trajectoryArc: cuántos objetivos cerrás/soltás (follow-through). Esto no
//     mira cierres/soltadas, mira DÓNDE cae tu esfuerzo real (pasos completados)
//     vs lo que declaraste prioritario.
//   - norteDrift: si le prestás ATENCIÓN al norte AHORA (editaste el objetivo).
//   - norteMomentum: pasos del norte en 30d (eficacia del norte SOLO).
//   Esto es el reparto del FOCO entre lo declarado y todo lo demás, como
//   TENDENCIA en el tiempo (ventana reciente vs previa).
//
// DECLARADO = el norte del año (buildYearCompass: ancla explícita o inferida) +
//   los objetivos activos de prioridad alta/crítica. (Las anclas de identidad se
//   pasan aparte a la reflexión IA como contexto; no atan actividad medible.)
// HECHO = los pasos (KRs + tareas) marcados 'hecho', atribuidos a su objetivo por
//   objectiveId y fechados por completedAt (migración 0070).
//
// PURO + determinístico, `now` inyectable. No inventa ni moraliza: cada número
// sale de un paso realmente completado. Soltar/repriorizar es una elección
// VÁLIDA, no una incoherencia moral — el copy nunca reprocha. Es la base sobre la
// que la reflexión IA opcional puede REFORMULAR el patrón, sin inventarlo.

import type { Goal, GoalCategory, ObjectiveStep } from '@/types'
import { buildYearCompass } from '@/lib/year-compass/build'
import { categoryLabelEs } from '@/lib/self/trajectoryArc'

export type CoherenceState =
  | 'insufficient' // sin prioridades declaradas o muy poca actividad para leer
  | 'coherent' // tu actividad reciente se concentra en lo declarado
  | 'mixed' // foco repartido entre lo declarado y otros frentes
  | 'diverging' // el grueso de tu actividad cae fuera de lo declarado

export type CoherenceTrend =
  | 'convergiendo' // la proporción hacia lo declarado viene subiendo
  | 'estable'
  | 'alejandose' // viene bajando
  | 'sin_datos' // falta período previo para comparar

export interface DeclaredGoalRef {
  id: string
  title: string
  category: GoalCategory
  isAnchor: boolean
}

export interface AreaActivity {
  category: GoalCategory
  count: number
}

export interface LifeCoherence {
  state: CoherenceState
  trend: CoherenceTrend
  /** Objetivos que declaraste prioritarios (norte + prioridad alta/crítica). */
  declared: DeclaredGoalRef[]
  /** Título del norte del año (ancla), o null. */
  anchorTitle: string | null
  /** Ventana reciente en días (para el copy). */
  windowDays: number
  /** Pasos completados en la ventana reciente sobre lo declarado / en total. */
  recentDeclaredDone: number
  recentTotalDone: number
  /** Ídem para la ventana previa (mismo largo, justo antes). */
  priorDeclaredDone: number
  priorTotalDone: number
  /** recentDeclaredDone / recentTotalDone (0..1); null si no hubo actividad reciente. */
  recentShare: number | null
  /** priorDeclaredDone / priorTotalDone (0..1); null si no hubo actividad previa. */
  priorShare: number | null
  /** Prioridades declaradas SIN ningún avance en la ventana reciente. */
  declaredIdle: DeclaredGoalRef[]
  /** Área de vida donde más cayó tu actividad reciente (por pasos completados). */
  topActivityArea: AreaActivity | null
  /** ¿Esa área es una de las de tus prioridades declaradas? */
  topActivityAreaDeclared: boolean
  message: string
}

const DAY = 86_400_000
/** Ventana reciente para leer el foco. Un trimestre: responde a cambios de rumbo
 *  sin ser tan corto que un par de pasos lo hagan saltar. */
const WINDOW_DAYS = 90
/** Mínimo de pasos completados (reciente + previo) para leer un patrón de foco. */
const MIN_ACTIVITY = 4
/** Umbral de proporción para "coherente" (la mayoría cae en lo declarado). */
const SHARE_COHERENT = 0.6
/** Umbral para "diverging" (el grueso cae fuera de lo declarado). */
const SHARE_DIVERGING = 0.34
/** Cambio mínimo de proporción entre períodos para llamarlo tendencia. */
const TREND_DELTA = 0.15

function parse(iso: string | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

function pct(ratio: number): number {
  return Math.round(ratio * 100)
}

/** ¿Es una prioridad declarada por su prioridad? (alta o crítica, y activa). */
function isDeclaredByPriority(g: Goal): boolean {
  return g.status === 'active' && (g.priority === 'critical' || g.priority === 'high')
}

/**
 * Coherencia declarado ↔ hecho a escala de vida. PURO.
 *
 * @param goals todos los objetivos (con o sin resolver)
 * @param steps todos los pasos (KRs + tareas); se filtran los 'hecho' con fecha
 * @param now   "hoy" inyectable para determinismo
 */
export function computeLifeCoherence(
  goals: Goal[],
  steps: ObjectiveStep[],
  now: Date = new Date(),
): LifeCoherence {
  const validGoals = (goals ?? []).filter((g) => g && (g.title ?? '').trim().length > 0)

  // ─── DECLARADO ───────────────────────────────────────────────────────
  // Norte del año: reusamos buildYearCompass (ancla explícita o inferida), la
  // misma que ve el usuario en "Tu año" / "Tu rumbo". No re-derivamos la lógica.
  const compass = buildYearCompass(validGoals, now)
  const anchorId = compass.anchor?.id ?? null
  const anchorTitle = compass.anchor?.title ?? null

  const declaredMap = new Map<string, DeclaredGoalRef>()
  const addDeclared = (g: Goal, isAnchor: boolean) => {
    const existing = declaredMap.get(g.id)
    if (existing) {
      if (isAnchor) existing.isAnchor = true
      return
    }
    declaredMap.set(g.id, { id: g.id, title: g.title, category: g.category, isAnchor })
  }
  for (const g of validGoals) {
    // El ancla cuenta como declarada aunque su prioridad no sea alta (es EL norte).
    if (anchorId && g.id === anchorId && g.status === 'active') addDeclared(g, true)
    else if (isDeclaredByPriority(g)) addDeclared(g, false)
  }
  const declared = [...declaredMap.values()]
  const declaredIds = new Set(declared.map((d) => d.id))
  const declaredCategories = new Set(declared.map((d) => d.category))

  // ─── HECHO ───────────────────────────────────────────────────────────
  // Mapa objectiveId → categoría, para atribuir cada paso a su área de vida.
  const goalCategory = new Map<string, GoalCategory>()
  for (const g of validGoals) goalCategory.set(g.id, g.category)

  const nowMs = now.getTime()
  const recentFrom = nowMs - WINDOW_DAYS * DAY
  const priorFrom = nowMs - 2 * WINDOW_DAYS * DAY

  let recentTotalDone = 0
  let recentDeclaredDone = 0
  let priorTotalDone = 0
  let priorDeclaredDone = 0
  const areaRecent = new Map<GoalCategory, number>()
  const declaredDoneById = new Map<string, number>()

  for (const s of steps ?? []) {
    if (!s || s.status !== 'hecho') continue
    const t = parse(s.completedAt)
    if (t === null || t > nowMs) continue
    // Solo pasos cuyo objetivo todavía existe (categoría conocida). Un paso
    // huérfano (objetivo borrado) no se puede atribuir a un área ni a lo declarado.
    const cat = goalCategory.get(s.objectiveId)
    if (!cat) continue
    const isDeclared = declaredIds.has(s.objectiveId)

    if (t >= recentFrom) {
      recentTotalDone += 1
      areaRecent.set(cat, (areaRecent.get(cat) ?? 0) + 1)
      if (isDeclared) {
        recentDeclaredDone += 1
        declaredDoneById.set(s.objectiveId, (declaredDoneById.get(s.objectiveId) ?? 0) + 1)
      }
    } else if (t >= priorFrom) {
      priorTotalDone += 1
      if (isDeclared) priorDeclaredDone += 1
    }
  }

  const recentShare = recentTotalDone > 0 ? recentDeclaredDone / recentTotalDone : null
  const priorShare = priorTotalDone > 0 ? priorDeclaredDone / priorTotalDone : null

  // Prioridades declaradas sin ningún avance reciente.
  const declaredIdle = declared.filter((d) => (declaredDoneById.get(d.id) ?? 0) === 0)

  // Área donde más cayó la actividad reciente.
  let topActivityArea: AreaActivity | null = null
  for (const [category, count] of areaRecent) {
    if (!topActivityArea || count > topActivityArea.count) topActivityArea = { category, count }
  }
  const topActivityAreaDeclared = topActivityArea ? declaredCategories.has(topActivityArea.category) : false

  const base = {
    declared,
    anchorTitle,
    windowDays: WINDOW_DAYS,
    recentDeclaredDone,
    recentTotalDone,
    priorDeclaredDone,
    priorTotalDone,
    recentShare,
    priorShare,
    declaredIdle,
    topActivityArea,
    topActivityAreaDeclared,
  }

  // ─── VEREDICTO ───────────────────────────────────────────────────────
  if (declared.length === 0) {
    return {
      ...base,
      state: 'insufficient',
      trend: 'sin_datos',
      message:
        'No marcaste prioridades: sin un norte del año ni objetivos de prioridad alta, no hay un "declarado" con qué comparar tu actividad. Fijá tu norte o subí la prioridad de lo que más importa.',
    }
  }

  if (recentTotalDone + priorTotalDone < MIN_ACTIVITY) {
    return {
      ...base,
      state: 'insufficient',
      trend: 'sin_datos',
      message: `Todavía hay poca actividad registrada (${recentTotalDone + priorTotalDone} paso${recentTotalDone + priorTotalDone === 1 ? '' : 's'} completado${recentTotalDone + priorTotalDone === 1 ? '' : 's'}) para leer si tu foco acompaña lo que declaraste. Se va a ir dibujando a medida que completes pasos de tus objetivos.`,
    }
  }

  if (recentShare === null) {
    // Hubo actividad previa pero nada en la ventana reciente.
    return {
      ...base,
      state: 'insufficient',
      trend: 'sin_datos',
      message: `Registraste avances antes, pero ninguno en los últimos ${WINDOW_DAYS} días, así que no puedo leer hacia dónde va tu foco ahora.`,
    }
  }

  const trend: CoherenceTrend =
    priorShare === null
      ? 'sin_datos'
      : recentShare - priorShare >= TREND_DELTA
        ? 'convergiendo'
        : priorShare - recentShare >= TREND_DELTA
          ? 'alejandose'
          : 'estable'

  const state: CoherenceState =
    recentShare >= SHARE_COHERENT ? 'coherent' : recentShare <= SHARE_DIVERGING ? 'diverging' : 'mixed'

  const message = buildMessage(state, trend, base as LifeCoherence)
  return { ...base, state, trend, message }
}

function declaredPhrase(c: Pick<LifeCoherence, 'anchorTitle' | 'declared'>): string {
  if (c.anchorTitle) {
    const others = c.declared.filter((d) => !d.isAnchor).length
    return others > 0 ? `tu norte ("${c.anchorTitle}") y ${others} prioridad${others === 1 ? '' : 'es'} más` : `tu norte ("${c.anchorTitle}")`
  }
  const n = c.declared.length
  return `tus ${n} prioridad${n === 1 ? '' : 'es'} declarada${n === 1 ? '' : 's'}`
}

function trendClause(trend: CoherenceTrend, recentShare: number | null, priorShare: number | null): string {
  if (trend === 'sin_datos' || recentShare === null || priorShare === null) return ''
  const from = pct(priorShare)
  const to = pct(recentShare)
  if (trend === 'convergiendo') return ` Y esa proporción viene subiendo respecto del período anterior (${from}% → ${to}%): venís convergiendo hacia lo declarado.`
  if (trend === 'alejandose') return ` Y esa proporción viene bajando respecto del período anterior (${from}% → ${to}%).`
  return ''
}

function idleClause(declaredIdle: DeclaredGoalRef[]): string {
  if (declaredIdle.length === 0) return ''
  const titles = declaredIdle.slice(0, 3).map((d) => `"${d.title}"`).join(', ')
  return ` Marcaste ${declaredIdle.length} prioridad${declaredIdle.length === 1 ? '' : 'es'} sin ningún avance reciente: ${titles}.`
}

function buildMessage(state: CoherenceState, trend: CoherenceTrend, c: LifeCoherence): string {
  const share = c.recentShare === null ? 0 : pct(c.recentShare)
  const decl = declaredPhrase(c)
  const trailTrend = trendClause(trend, c.recentShare, c.priorShare)

  if (state === 'coherent') {
    return `De tus últimos ${c.recentTotalDone} avances, ${c.recentDeclaredDone} (${share}%) fueron sobre ${decl}. Tu actividad acompaña lo que decís que importa.${trailTrend}${idleClause(c.declaredIdle)}`
  }

  if (state === 'mixed') {
    return `De tus últimos ${c.recentTotalDone} avances, ${c.recentDeclaredDone} (${share}%) cayeron en ${decl} y el resto en otros frentes. Foco repartido.${trailTrend}${idleClause(c.declaredIdle)}`
  }

  // diverging — sin reproche: puede ser un cambio de foco a propósito.
  const areaClause =
    c.topActivityArea && !c.topActivityAreaDeclared
      ? ` El grueso fue a ${categoryLabelEs(c.topActivityArea.category)}, un área que hoy no está entre tus prioridades declaradas.`
      : ''
  return `De tus últimos ${c.recentTotalDone} avances, solo ${c.recentDeclaredDone} (${share}%) fueron sobre ${decl}.${areaClause} No es un reproche: puede ser un cambio de foco a propósito. Vale mirar si querés que tus prioridades declaradas reflejen dónde está yendo tu energía —o al revés.${trailTrend}${idleClause(c.declaredIdle)}`
}

/** Resumen compacto de una línea para la reflexión IA: números REALES que el LLM
 *  puede REFORMULAR, no inventar. null si no hay coherencia con sustancia
 *  (insufficient: sin declarado o sin actividad para leer). */
export function coherenceSummaryLine(c: LifeCoherence): string | null {
  if (c.state === 'insufficient') return null
  const parts: string[] = []
  const share = c.recentShare === null ? 0 : pct(c.recentShare)
  parts.push(
    `foco declarado ↔ hecho: ${c.recentDeclaredDone}/${c.recentTotalDone} avances recientes (${share}%) sobre lo declarado (${c.state})`,
  )
  if (c.anchorTitle) parts.push(`norte: "${c.anchorTitle}"`)
  if (c.priorShare !== null) parts.push(`período previo ${pct(c.priorShare)}% → tendencia ${c.trend}`)
  if (c.declaredIdle.length > 0) {
    parts.push(`${c.declaredIdle.length} prioridad(es) sin avance reciente: ${c.declaredIdle.slice(0, 3).map((d) => d.title).join(', ')}`)
  }
  if (c.topActivityArea && !c.topActivityAreaDeclared) {
    parts.push(`el grueso de la actividad cayó en ${categoryLabelEs(c.topActivityArea.category)} (fuera de lo declarado)`)
  }
  return parts.join('; ')
}
