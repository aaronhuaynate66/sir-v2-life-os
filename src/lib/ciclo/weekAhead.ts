// SIR V2 — Detector PROACTIVO de "semana con carga afectiva". PURO.
//
// Proyecta las VENTANAS SENSIBLES del ciclo (premenstrual + menstrual) de las
// mujeres del círculo de Aaron y detecta cuáles INTERSECTAN los próximos días.
// Si dos o más coinciden en la misma ventana, marca el CLÚSTER (sincronía).
// Alimenta un nudge anticipado de CUIDADO en el brief ("esta semana conviene
// más suavidad con X e Y").
//
// LÍNEA ÉTICA (doc 17 / SIR_ASK_SYSTEM_PROMPT, regla CICLO MENSTRUAL) — NO
// NEGOCIABLE: esto es para CUIDADO y consideración (timing, dar espacio,
// presencia, anticipación amable), NUNCA para descalificar, predecir conducta
// como mecanismo, ni "gestionar" a nadie. El ciclo MODULA, no dicta. La copy es
// de cuidado ("conviene suavidad", "dar un poco de espacio", "presencia"), JAMÁS
// "estará insoportable", "cuidado con ella", "viene difícil". Tendencia, no
// veredicto. SIEMPRE se marca que es una estimación (baja confianza con poca data).
//
// PURO y determinístico: `now` inyectable, sin I/O, sin LLM.

const DAY_MS = 86_400_000
/** Días 1-5 del ciclo = ventana menstrual (sangrado). */
const MENSTRUAL_DAYS = 5
/** ~5 días antes del período = ventana premenstrual (SPM). */
const PMS_WINDOW_DAYS = 5
const DEFAULT_LENGTH = 28
const MIN_LENGTH = 15
const MAX_LENGTH = 60
/** Antigüedad máxima (días) de un ancla para contar como "ventana AHORA". */
const ANCHOR_LOOKBACK_DAYS = 5

export type SensitiveKind = 'premenstrual' | 'menstrual'
export type WeekAheadConfidence = 'alta' | 'media' | 'baja'
/** Cómo se derivó la ventana: observada (ancla reciente) vs proyectada (calendario). */
export type WeekAheadBasis = 'observado' | 'proyectado'

/** Ancla de estado observado, típicamente una fila de `person_cycles`. */
export interface CycleAnchor {
  /** YYYY-MM-DD. */
  date: string
  /** Fase de person_cycles: 'bleeding' | 'pms' | 'mid_cycle' | 'ovulation' | 'luteal' | 'unknown'. */
  phase: string
}

export interface WomanCycleInput {
  personId: string
  name: string
  /** Inicio del último período (YYYY-MM-DD). Base de la proyección por calendario. */
  cycleStartDate?: string | null
  /** Largo medio del ciclo. Default 28. Clamp [15, 60]. */
  cycleLengthDays?: number | null
  /** Anclas observadas (person_cycles). Una 'pms'/'bleeding' reciente = ventana AHORA. */
  anchors?: CycleAnchor[]
}

/** Una ventana sensible que INTERSECTA el horizonte, por mujer. */
export interface SensitiveWindow {
  personId: string
  name: string
  kind: SensitiveKind
  /** YYYY-MM-DD. */
  windowStart: string
  windowEnd: string
  confidence: WeekAheadConfidence
  basis: WeekAheadBasis
  /** true si la ventana está activa HOY (contiene `now`). */
  activeNow: boolean
}

export interface CycleWeekAhead {
  horizonDays: number
  /** Rango del horizonte (YYYY-MM-DD). */
  from: string
  to: string
  /** Mujeres con una ventana sensible que interseca el horizonte (una por mujer). */
  women: SensitiveWindow[]
  /** ≥2 mujeres cuyas ventanas se solapan en el tiempo dentro del horizonte. */
  synced: boolean
  /** Nombres del clúster sincronizado (o [] si no hay). */
  syncedNames: string[]
}

// ─── utilidades de fecha (UTC, día-a-día, como horizon.ts) ───────────────────

function dayT(iso: string): number | null {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  return Number.isFinite(t) ? t : null
}

function isoOf(t: number): string {
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Día calendario de `now` como medianoche UTC (paridad con horizon.ts). */
function nowDayT(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
}

function clampLength(len: number | null | undefined): number {
  const n = Math.round(len || DEFAULT_LENGTH)
  if (!Number.isFinite(n)) return DEFAULT_LENGTH
  return Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, n))
}

/** ¿Se solapan los intervalos [aFrom,aTo] y [bFrom,bTo]? (inclusive). */
function overlaps(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom <= bTo && bFrom <= aTo
}

interface Candidate {
  kind: SensitiveKind
  from: number
  to: number
  basis: WeekAheadBasis
}

/**
 * Cuenta ciclos observados a partir de las anclas de sangrado (inicios de
 * período separados por > NEW_PERIOD_GAP). Simplificado respecto de
 * regularity.ts; solo sirve para graduar la confianza de la proyección.
 */
function observedCyclesFromAnchors(anchors: CycleAnchor[]): number {
  const NEW_PERIOD_GAP = 10
  const days = [...new Set(
    anchors.filter((a) => a.phase === 'bleeding').map((a) => dayT(a.date)).filter((t): t is number => t !== null),
  )].sort((a, b) => a - b)
  let starts = 0
  let prev = -Infinity
  for (const d of days) {
    if ((d - prev) / DAY_MS > NEW_PERIOD_GAP) starts++
    prev = d
  }
  return Math.max(0, starts - 1) // nº de gaps completos entre inicios
}

/**
 * Proyecta las ventanas sensibles de UNA mujer y devuelve la representativa que
 * interseca el horizonte (la activa hoy, o la que empiece antes), o null.
 */
function womanWindow(
  w: WomanCycleInput,
  nowT: number,
  horizonFromT: number,
  horizonToT: number,
): SensitiveWindow | null {
  const anchors = w.anchors ?? []
  const candidates: Candidate[] = []

  // 1) ANCLAS OBSERVADAS: una 'pms'/'bleeding' reciente = ventana sensible AHORA.
  //    Ventana ≈ [ancla, ancla+4]. Solo si el ancla es reciente (≤ lookback) y no
  //    demasiado futura (dentro del horizonte).
  for (const a of anchors) {
    const t = dayT(a.date)
    if (t === null) continue
    const ageDays = (nowT - t) / DAY_MS
    if (ageDays > ANCHOR_LOOKBACK_DAYS) continue // ancla vieja: ya pasó
    if (t > horizonToT) continue // ancla más allá del horizonte
    const kind: SensitiveKind | null = a.phase === 'bleeding' ? 'menstrual' : a.phase === 'pms' ? 'premenstrual' : null
    if (!kind) continue
    candidates.push({ kind, from: t, to: t + (MENSTRUAL_DAYS - 1) * DAY_MS, basis: 'observado' })
  }

  // 2) PROYECCIÓN POR CALENDARIO desde cycleStartDate + largo.
  const startT = w.cycleStartDate ? dayT(w.cycleStartDate) : null
  if (startT !== null) {
    const length = clampLength(w.cycleLengthDays)
    const lenMs = length * DAY_MS
    // Cubrir desde un ciclo antes del horizonte hasta un poco después.
    const kFrom = Math.floor((horizonFromT - lenMs - startT) / lenMs)
    const kTo = Math.ceil((horizonToT + lenMs - startT) / lenMs)
    for (let k = Math.max(0, kFrom); k <= kTo && k < 500; k++) {
      const p = startT + k * lenMs
      // Menstrual: días 1-5 → [P, P+4].
      candidates.push({ kind: 'menstrual', from: p, to: p + (MENSTRUAL_DAYS - 1) * DAY_MS, basis: 'proyectado' })
      // Premenstrual: ~5 días antes del inicio → [P-5, P-1].
      candidates.push({ kind: 'premenstrual', from: p - PMS_WINDOW_DAYS * DAY_MS, to: p - DAY_MS, basis: 'proyectado' })
    }
  }

  // Quedarse solo con las que intersecan el horizonte.
  const inHorizon = candidates.filter((c) => overlaps(c.from, c.to, horizonFromT, horizonToT))
  if (inHorizon.length === 0) return null

  // Elegir la representativa: primero la ACTIVA hoy; si no, la que empiece antes.
  // A igualdad, preferir la observada (más firme que la proyectada).
  const basisRank = (b: WeekAheadBasis) => (b === 'observado' ? 0 : 1)
  inHorizon.sort((a, b) => {
    const aActive = a.from <= nowT && nowT <= a.to
    const bActive = b.from <= nowT && nowT <= b.to
    if (aActive !== bActive) return aActive ? -1 : 1
    if (a.from !== b.from) return a.from - b.from
    return basisRank(a.basis) - basisRank(b.basis)
  })
  const pick = inHorizon[0]

  // Confianza: observada (vimos el estado) → 'media'; proyección con historia →
  // sube; proyección desde una sola fecha (poca data) → 'baja'. Honestidad ante todo.
  let confidence: WeekAheadConfidence
  if (pick.basis === 'observado') {
    confidence = 'media'
  } else {
    const cycles = observedCyclesFromAnchors(anchors)
    confidence = cycles >= 3 ? 'alta' : cycles >= 1 ? 'media' : 'baja'
  }

  return {
    personId: w.personId,
    name: w.name,
    kind: pick.kind,
    windowStart: isoOf(pick.from),
    windowEnd: isoOf(pick.to),
    confidence,
    basis: pick.basis,
    activeNow: pick.from <= nowT && nowT <= pick.to,
  }
}

/**
 * Detecta la "semana con carga afectiva": ventanas sensibles del ciclo que
 * intersecan los próximos `horizonDays`, y la sincronía entre mujeres. PURO.
 *
 * @param women    Mujeres del círculo (con ciclo cargado y/o anclas).
 * @param now      Fecha "ahora" (inyectable para tests).
 * @param horizonDays Ventana de anticipación en días (default 7).
 */
export function buildCycleWeekAhead(
  women: WomanCycleInput[],
  now: Date = new Date(),
  horizonDays = 7,
): CycleWeekAhead {
  const h = Math.max(1, Math.round(horizonDays))
  const nowT = nowDayT(now)
  const horizonFromT = nowT
  const horizonToT = nowT + h * DAY_MS

  const found: SensitiveWindow[] = []
  for (const w of women) {
    const win = womanWindow(w, nowT, horizonFromT, horizonToT)
    if (win) found.push(win)
  }

  // Orden estable: activas hoy primero, luego por inicio de ventana, luego nombre.
  found.sort((a, b) => {
    if (a.activeNow !== b.activeNow) return a.activeNow ? -1 : 1
    if (a.windowStart !== b.windowStart) return a.windowStart < b.windowStart ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  // SINCRONÍA: componentes conexas del grafo de solape temporal entre ventanas.
  // Cualquier componente con ≥2 mujeres marca el clúster.
  const iv = found.map((w) => ({ from: dayT(w.windowStart)!, to: dayT(w.windowEnd)! }))
  const n = found.length
  const parent = Array.from({ length: n }, (_, i) => i)
  const root = (x: number): number => (parent[x] === x ? x : (parent[x] = root(parent[x])))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (overlaps(iv[i].from, iv[i].to, iv[j].from, iv[j].to)) parent[root(i)] = root(j)
    }
  }
  const groups = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    const r = root(i)
    const arr = groups.get(r) ?? []
    arr.push(i)
    groups.set(r, arr)
  }
  const syncedIdx = [...groups.values()].filter((g) => g.length >= 2).flat()
  const synced = syncedIdx.length >= 2
  const syncedNames = synced
    ? found.filter((_, i) => syncedIdx.includes(i)).map((w) => w.name)
    : []

  return {
    horizonDays: h,
    from: isoOf(horizonFromT),
    to: isoOf(horizonToT),
    women: found,
    synced,
    syncedNames,
  }
}

// ─── línea de alerta (TONO DE CUIDADO, honesta con la confianza) ─────────────

/** Nombres a mostrar: solo el primer nombre, salvo colisión (dos "Diana") →
 *  desambigua con el apellido para no listar "Diana, Diana". */
function displayNames(fullNames: string[]): string[] {
  const tokens = fullNames.map((n) => n.trim().split(/\s+/).filter(Boolean))
  const firsts = tokens.map((t) => t[0] ?? '')
  const counts = new Map<string, number>()
  for (const f of firsts) counts.set(f, (counts.get(f) ?? 0) + 1)
  return tokens.map((t, i) => ((counts.get(firsts[i]) ?? 0) > 1 && t.length > 1 ? `${t[0]} ${t[1]}` : firsts[i]))
}

/** Formatea "A", "A y B", "A, B y C" (desambiguando primeros nombres repetidos). */
function joinNames(names: string[]): string {
  const shown = displayNames(names)
  if (shown.length === 0) return ''
  if (shown.length === 1) return shown[0]
  if (shown.length === 2) return `${shown[0]} y ${shown[1]}`
  return `${shown.slice(0, -1).join(', ')} y ${shown[shown.length - 1]}`
}

const KIND_LABEL: Record<SensitiveKind, string> = {
  premenstrual: 'premenstrual',
  menstrual: 'menstrual',
}

/** ¿Toda la evidencia es floja (proyección sin historia)? → marcar estimación amplia. */
function allLowConfidence(women: SensitiveWindow[]): boolean {
  return women.length > 0 && women.every((w) => w.confidence === 'baja')
}

/**
 * Arma la línea del brief con TONO DE CUIDADO. Devuelve null si no hay ninguna
 * ventana. NUNCA descalifica ni predice conducta: habla de suavidad, presencia,
 * dar espacio; y SIEMPRE marca que es una estimación (tendencia, no veredicto).
 */
export function buildCycleWeekAheadLine(wa: CycleWeekAhead): string | null {
  if (wa.women.length === 0) return null

  const est = allLowConfidence(wa.women) ? 'estimación amplia, poca data' : 'estimación'
  const closing = `conviene un poco más de suavidad en el timing y algo de presencia — tendencia, no certeza (${est}).`

  // CLÚSTER (sincronía): ≥2 mujeres coinciden en la ventana.
  if (wa.synced && wa.syncedNames.length >= 2) {
    const inSync = wa.women.filter((w) => wa.syncedNames.includes(w.name))
    const menstrual = inSync.filter((w) => w.kind === 'menstrual').length
    const pms = inSync.filter((w) => w.kind === 'premenstrual').length
    const parts: string[] = []
    if (menstrual > 0) parts.push(`${menstrual} en fase menstrual`)
    if (pms > 0) parts.push(`${pms} premenstrual`)
    const detail = parts.length > 0 ? ` (${parts.join(', ')})` : ''
    return `Semana con carga afectiva: coinciden ${joinNames(wa.syncedNames)} en una ventana sensible del ciclo${detail}. Esta semana ${closing} Dales un poco de espacio si lo piden; sin tratar a nadie distinto.`
  }

  // Una sola mujer.
  if (wa.women.length === 1) {
    const w = wa.women[0]
    return `Esta semana ${joinNames([w.name])} entra en su ventana ${KIND_LABEL[w.kind]} del ciclo: ${closing} Presencia y espacio, sin tratarla distinto.`
  }

  // Varias, pero sin solape simultáneo entre ellas.
  const names = joinNames(wa.women.map((w) => w.name))
  return `Semana con más sensibilidad en el círculo: ${names} pasan por una ventana sensible del ciclo estos días. ${closing.charAt(0).toUpperCase()}${closing.slice(1)} Sin tratar a nadie distinto.`
}
