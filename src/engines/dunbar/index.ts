// SIR V2 — Mapa de capas de Dunbar + alertas de sobre/sub-inversión (15·1).
//
// Base científica: número de Dunbar y capas de la red social (ver
// `docs/15_RELATIONAL_INTELLIGENCE.md`). La capacidad para relaciones es finita y
// se organiza en capas de tamaño e intensidad decrecientes; cada una pide una
// cadencia de contacto distinta. `people.category` ya mapea casi 1:1 a las capas.
//
// Este motor es PURO: dado el set de personas, arma el mapa por capa (cuántos hay
// vs. el tamaño de referencia) y saca alertas de (a) capa SOBRE-poblada (te estás
// esparciendo fino) y (b) gente SUB-invertida (contacto más viejo que lo que la
// capa espera → riesgo de que el vínculo se caiga). Honesto: la referencia de
// Dunbar es un promedio poblacional, no una regla dura — se enuncia como señal.

export type DunbarCategory = 'inner_circle' | 'close' | 'network' | 'peripheral'

interface LayerDef {
  category: DunbarCategory
  label: string
  /** Tamaño de referencia de Dunbar para la capa (5 / 15 / 50 / 150). */
  softCap: number
  /** A partir de cuántos días sin contacto la capa se considera desatendida. */
  staleDays: number
}

// Las capas clásicas de Dunbar (Hill & Dunbar). La cadencia esperada baja con la
// intimidad: al círculo íntimo lo ves seguido, a la periferia una vez al año.
export const DUNBAR_LAYERS: readonly LayerDef[] = [
  { category: 'inner_circle', label: 'Círculo íntimo', softCap: 5, staleDays: 21 },
  { category: 'close', label: 'Cercanos', softCap: 15, staleDays: 45 },
  { category: 'network', label: 'Red', softCap: 50, staleDays: 120 },
  { category: 'peripheral', label: 'Periferia', softCap: 150, staleDays: 365 },
] as const

/** Forma mínima de persona que el motor necesita. */
export interface DunbarPerson {
  id: string
  name: string
  category: DunbarCategory
  /** ISO 'YYYY-MM-DD' o null/undefined si nunca se registró contacto. */
  lastContact?: string | null
}

export interface LayerStat {
  category: DunbarCategory
  label: string
  count: number
  softCap: number
  /** count > softCap → te estás esparciendo más fino de lo sostenible. */
  overCap: boolean
  staleDays: number
  staleCount: number
  /** Hasta 6 nombres desatendidos de la capa (para accionar). */
  stalePeople: { id: string; name: string; days: number }[]
}

export type DunbarSeverity = 'high' | 'medium' | 'low'

export interface DunbarAlert {
  kind: 'stale_contact' | 'over_capacity' | 'empty_inner'
  category: DunbarCategory
  severity: DunbarSeverity
  title: string
  detail: string
}

export interface DunbarResult {
  layers: LayerStat[]
  total: number
  alerts: DunbarAlert[]
}

const DAY = 86_400_000

/** Días desde `lastContact` hasta ahora. Infinity si nunca hubo contacto. */
function daysSince(lastContact: string | null | undefined, nowMs: number): number {
  if (!lastContact) return Infinity
  const t = Date.parse(lastContact)
  if (!Number.isFinite(t)) return Infinity
  return Math.max(0, Math.floor((nowMs - t) / DAY))
}

/**
 * Analiza la red por capas de Dunbar. `nowMs` inyectable (tests). Solo considera
 * personas con una de las 4 categorías canónicas.
 */
export function analyzeDunbar(people: DunbarPerson[], nowMs: number): DunbarResult {
  const byCat = new Map<DunbarCategory, DunbarPerson[]>()
  for (const l of DUNBAR_LAYERS) byCat.set(l.category, [])
  for (const p of people) {
    const bucket = byCat.get(p.category)
    if (bucket) bucket.push(p)
  }

  const layers: LayerStat[] = DUNBAR_LAYERS.map((l) => {
    const members = byCat.get(l.category)!
    const stale = members
      .map((p) => ({ id: p.id, name: p.name, days: daysSince(p.lastContact, nowMs) }))
      .filter((s) => s.days >= l.staleDays)
      .sort((a, b) => b.days - a.days)
    return {
      category: l.category,
      label: l.label,
      count: members.length,
      softCap: l.softCap,
      overCap: members.length > l.softCap,
      staleDays: l.staleDays,
      staleCount: stale.length,
      stalePeople: stale.slice(0, 6).map((s) => ({ id: s.id, name: s.name, days: s.days === Infinity ? -1 : s.days })),
    }
  })

  const alerts = buildAlerts(layers)
  return { layers, total: people.length, alerts }
}

function buildAlerts(layers: LayerStat[]): DunbarAlert[] {
  const alerts: DunbarAlert[] = []
  const inner = layers.find((l) => l.category === 'inner_circle')!
  const close = layers.find((l) => l.category === 'close')!

  // (1) Sub-inversión en las capas que importan: gente íntima/cercana sin contacto.
  //     Es la alerta de mayor valor — son los vínculos que más pesan y los que
  //     silenciosamente se caen.
  if (inner.staleCount > 0) {
    alerts.push({
      kind: 'stale_contact', category: 'inner_circle', severity: 'high',
      title: `${inner.staleCount} de tu círculo íntimo sin contacto`,
      detail: `Hace más de ${inner.staleDays} días que no hablas con ${namesOf(inner)}. Son los que más pesan — un mensaje corto alcanza.`,
    })
  }
  if (close.staleCount > 0) {
    alerts.push({
      kind: 'stale_contact', category: 'close', severity: 'medium',
      title: `${close.staleCount} cercanos enfriándose`,
      detail: `Sin contacto hace >${close.staleDays} días: ${namesOf(close)}. A este ritmo bajan de capa.`,
    })
  }

  // (2) Sobre-capacidad: más gente en una capa de la que se sostiene (Dunbar).
  //     No es un error, es una señal: quizás algunos son de una capa más externa.
  for (const l of layers) {
    if (l.overCap) {
      alerts.push({
        kind: 'over_capacity', category: l.category, severity: l.category === 'inner_circle' ? 'medium' : 'low',
        title: `${l.label}: ${l.count} personas (referencia ~${l.softCap})`,
        detail: `Mantener ${l.count} vínculos a este nivel de intimidad cuesta. Si alguno ya no es tan cercano, quizás va en una capa más externa — así cuidas mejor a los que sí.`,
      })
    }
  }

  // (3) Círculo íntimo vacío (solo si hay red suficiente como para que sea raro).
  if (inner.count === 0 && (close.count + inner.count) >= 1) {
    alerts.push({
      kind: 'empty_inner', category: 'inner_circle', severity: 'low',
      title: 'Sin nadie en el círculo íntimo',
      detail: 'Nadie marcado como círculo íntimo. Si hay 1-2 personas que son tu sostén real, marcarlas ayuda a que SIR las priorice.',
    })
  }

  return alerts
}

function namesOf(l: LayerStat): string {
  const names = l.stalePeople.map((p) => p.name)
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} y ${l.staleCount - 3} más`
}
