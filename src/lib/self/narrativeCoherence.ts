// SIR V2 — "Coherencia narrativa" entre capítulos de vida (E5, Life Direction).
//
// lifeSeasons.ts parte la vida en CAPÍTULOS (rachas temáticas). coherence.ts mira
// el foco reciente vs lo declarado (90d). Lo que falta —y esto lo cubre— es leer
// el ARCO: ¿los capítulos comparten un hilo conductor (áreas/objetivos que
// persisten a través del tiempo), o cada uno es un tema nuevo sin continuidad?
//
// Es la "coherencia narrativa" de la identidad narrativa (McAdams): una vida que
// se lee como un hilo continuo, no como fragmentos inconexos, correlaciona con
// bienestar. PERO acá NO se moraliza: un arco fragmentado puede ser exploración o
// reinvención sana. El copy describe la forma, no la juzga.
//
// PURO + determinístico. Consume los LifeSeason ya computados (no re-deriva).
// Alimenta la reflexión IA del rumbo (narrativeCoherenceSummaryLine) sin inventar.

import type { GoalCategory } from '@/types'
import { categoryLabelEs } from '@/lib/self/trajectoryArc'
import type { LifeSeason } from '@/lib/self/lifeSeasons'

export type NarrativeState =
  | 'insufficient' // menos de 2 capítulos: sin arco que contrastar
  | 'continuous' // hay hilos que persisten a través de los capítulos
  | 'transitioning' // hay historia, pero el capítulo actual pivotea a un tema nuevo
  | 'fragmented' // capítulos sin áreas recurrentes: cada uno su propio tema

export interface Throughline {
  category: GoalCategory
  /** En cuántos capítulos aparece esta área. */
  chapters: number
}

export interface BridgingGoal {
  id: string
  title: string
  /** En cuántos capítulos aparece este objetivo (cruza estaciones). */
  chapters: number
}

export interface NarrativeCoherence {
  state: NarrativeState
  chapterCount: number
  /** Áreas de vida que reaparecen en 2+ capítulos, desc por presencia. El hilo. */
  throughlines: Throughline[]
  /** Objetivos que vivieron en 2+ capítulos (siguieron vivos entre estaciones). */
  bridgingGoals: BridgingGoal[]
  /** ¿El capítulo actual comparte área/objetivo dominante con el anterior? */
  currentContinuesPrevious: boolean
  message: string
}

/** Área dominante de un capítulo (la de más eventos). null si no hay. */
function dominantCategory(s: LifeSeason): GoalCategory | null {
  return s.categories.length > 0 ? s.categories[0].category : null
}

/**
 * Lee la coherencia del arco a partir de los capítulos. PURO.
 *
 * @param seasons capítulos de la más RECIENTE a la más antigua (como los da buildLifeSeasons)
 * @param anchorCategory área del norte del año, para leer si el arco converge ahí (opcional)
 */
export function computeNarrativeCoherence(
  seasons: LifeSeason[],
  anchorCategory?: GoalCategory | null,
): NarrativeCoherence {
  const chapters = (seasons ?? []).filter((s) => s && s.categories)
  const chapterCount = chapters.length

  const empty: Omit<NarrativeCoherence, 'state' | 'message'> = {
    chapterCount,
    throughlines: [],
    bridgingGoals: [],
    currentContinuesPrevious: false,
  }

  if (chapterCount < 2) {
    return {
      ...empty,
      state: 'insufficient',
      message:
        chapterCount === 0
          ? 'Todavía no hay capítulos para leer un arco. Se dibuja a medida que vives estaciones (rachas de objetivos).'
          : 'Estás en tu primer capítulo. El arco —si tus temas forman un hilo o pivotean— se va a poder leer cuando haya un segundo.',
    }
  }

  // ─── Hilos: áreas que reaparecen en varios capítulos ────────────────
  const catChapters = new Map<GoalCategory, number>()
  for (const s of chapters) {
    // Cada categoría cuenta UNA vez por capítulo (presencia, no volumen).
    const seen = new Set<GoalCategory>()
    for (const c of s.categories) {
      if (seen.has(c.category)) continue
      seen.add(c.category)
      catChapters.set(c.category, (catChapters.get(c.category) ?? 0) + 1)
    }
  }
  const throughlines: Throughline[] = [...catChapters.entries()]
    .filter(([, n]) => n >= 2)
    .map(([category, chaptersN]) => ({ category, chapters: chaptersN }))
    .sort((a, b) => b.chapters - a.chapters)

  // ─── Objetivos puente: viven en 2+ capítulos ────────────────────────
  const goalChapters = new Map<string, { title: string; chapters: number }>()
  for (const s of chapters) {
    const seen = new Set<string>()
    for (const g of s.goals) {
      if (seen.has(g.id)) continue
      seen.add(g.id)
      const cur = goalChapters.get(g.id)
      if (cur) cur.chapters += 1
      else goalChapters.set(g.id, { title: g.title, chapters: 1 })
    }
  }
  const bridgingGoals: BridgingGoal[] = [...goalChapters.entries()]
    .filter(([, v]) => v.chapters >= 2)
    .map(([id, v]) => ({ id, title: v.title, chapters: v.chapters }))
    .sort((a, b) => b.chapters - a.chapters)

  // ─── ¿El actual continúa el anterior? ───────────────────────────────
  // chapters[0] = más reciente, chapters[1] = anterior.
  const current = chapters[0]
  const previous = chapters[1]
  const curDom = dominantCategory(current)
  const prevDom = dominantCategory(previous)
  const sharesGoal = current.goals.some((g) => previous.goals.some((p) => p.id === g.id))
  const currentContinuesPrevious = (curDom !== null && curDom === prevDom) || sharesGoal

  // ─── Veredicto (el PRESENTE manda: distingue hilo vivo de hilo histórico) ──
  // - continuous: el capítulo actual retoma el anterior (el hilo sigue vivo hoy).
  // - transitioning: hubo hilo (áreas recurrentes o un objetivo puente) pero el
  //   actual pivotea a un tema nuevo.
  // - fragmented: ni el actual continúa nada, ni hay recurrencia previa.
  const hasBridge = bridgingGoals.length > 0
  let state: NarrativeState
  if (currentContinuesPrevious) {
    state = 'continuous'
  } else if (throughlines.length > 0 || hasBridge) {
    state = 'transitioning'
  } else {
    state = 'fragmented'
  }

  const message = buildMessage(state, {
    chapterCount,
    throughlines,
    bridgingGoals,
    current,
    previous,
    anchorCategory: anchorCategory ?? null,
  })

  return { ...empty, throughlines, bridgingGoals, currentContinuesPrevious, state, message }
}

interface MsgCtx {
  chapterCount: number
  throughlines: Throughline[]
  bridgingGoals: BridgingGoal[]
  current: LifeSeason
  previous: LifeSeason
  anchorCategory: GoalCategory | null
}

function throughlinePhrase(t: Throughline[]): string {
  if (t.length === 0) return ''
  const top = t.slice(0, 2).map((x) => `${categoryLabelEs(x.category)} (${x.chapters} capítulos)`)
  return top.join(' y ')
}

function buildMessage(state: NarrativeState, c: MsgCtx): string {
  const anchorClause =
    c.anchorCategory && c.throughlines.some((t) => t.category === c.anchorCategory)
      ? ` Tu norte (${categoryLabelEs(c.anchorCategory)}) es parte de ese hilo.`
      : ''

  if (state === 'continuous') {
    const hilo = throughlinePhrase(c.throughlines)
    const bridge =
      c.bridgingGoals.length > 0
        ? ` "${c.bridgingGoals[0].title}" te acompañó a través de ${c.bridgingGoals[0].chapters} capítulos.`
        : ''
    const base = hilo
      ? `Tu historia tiene un hilo: ${hilo} reaparece capítulo tras capítulo.`
      : 'Tus capítulos se encadenan: el actual retoma el tema del anterior.'
    return `${base}${bridge}${anchorClause} No eres fragmentos sueltos: hay una dirección que persiste.`
  }

  if (state === 'transitioning') {
    const prevLabel = c.previous.label
    const curLabel = c.current.label
    const hiloPrev = throughlinePhrase(c.throughlines)
    const hiloClause = hiloPrev ? ` El hilo de fondo sigue siendo ${hiloPrev}.` : ''
    return `Estás en una transición: tu capítulo anterior giró en torno a ${prevLabel} y el actual pivotea hacia ${curLabel}.${hiloClause}${anchorClause} Un giro de tema no rompe tu historia —puede ser exactamente el capítulo nuevo que necesitas—; vale mirar si es un rumbo elegido o una deriva.`
  }

  // fragmented — descriptivo, sin reproche.
  return `Por ahora tus ${c.chapterCount} capítulos no comparten un hilo temático claro: cada uno giró en torno a algo distinto, sin un área que reaparezca. Eso no es malo —puede ser una etapa de exploración o de reinvención—, pero si buscas sentido de continuidad, elige un frente que quieras sostener entre estaciones.`
}

/** Resumen de una línea para la reflexión IA del rumbo. null si no hay arco que
 *  leer (insufficient). Números/etiquetas REALES para REFORMULAR, no inventar. */
export function narrativeCoherenceSummaryLine(n: NarrativeCoherence): string | null {
  if (n.state === 'insufficient') return null
  const parts: string[] = [`arco narrativo: ${n.state} (${n.chapterCount} capítulos)`]
  if (n.throughlines.length > 0) {
    parts.push(
      `hilos: ${n.throughlines.slice(0, 2).map((t) => `${categoryLabelEs(t.category)} en ${t.chapters}`).join(', ')}`,
    )
  }
  if (n.bridgingGoals.length > 0) {
    parts.push(`objetivo puente: "${n.bridgingGoals[0].title}" (${n.bridgingGoals[0].chapters} capítulos)`)
  }
  parts.push(n.currentContinuesPrevious ? 'el capítulo actual continúa el anterior' : 'el capítulo actual pivotea')
  return parts.join('; ')
}
