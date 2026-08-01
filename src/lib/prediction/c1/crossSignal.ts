// SIR V2 — C1 cruzado (N-de-1): el vínculo entre DOS señales tuyas. PURO.
//
// La joya idiográfica: en ti, ¿dormir mejor predice más energía/mejor ánimo al
// día siguiente? No es la norma poblacional — es tu patrón, medido en tus datos.
// Empareja sueño (noche d) → energía/ánimo (día d+1) y calcula la correlación de
// Pearson. Honesto: coincidencia, no causa; `insufficient` con pocos pares; la
// confianza sube con n. Es lo que hace que registrar a diario VALGA la pena — cada
// día suma un par y afina el patrón.

const DAY = 86_400_000
const MIN_PAIRS = 6

export interface SelfPoint {
  /** YYYY-MM-DD */
  day: string
  value: number
}
export interface SleepPoint {
  /** YYYY-MM-DD de la noche */
  day: string
  /** 0-100 (score o quality*10) */
  score: number
}

export interface CrossLink {
  target: 'energy' | 'mood'
  pairs: number
  r: number
  /** 'sube' = mejor sueño → más energía/ánimo (r>0); 'baja' = inverso. */
  direction: 'sube' | 'baja'
  strength: 'fuerte' | 'moderado' | 'débil'
  confidence: 'baja' | 'media'
}
export interface CrossSignalResult {
  links: CrossLink[]
  insufficient: string[]
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

function linkFor(
  target: 'energy' | 'mood',
  sleep: Map<string, number>,
  self: Map<string, number>,
): CrossLink | { insufficient: string } {
  // Par: noche d → señal del día SIGUIENTE (d+1).
  const xs: number[] = []
  const ys: number[] = []
  for (const [day, score] of sleep) {
    const next = new Date(Date.parse(day) + DAY).toISOString().slice(0, 10)
    const v = self.get(next)
    if (v == null) continue
    xs.push(score)
    ys.push(v)
  }
  if (xs.length < MIN_PAIRS) {
    return { insufficient: `${target}: ${xs.length} pares sueño→día siguiente (hacen falta ≥${MIN_PAIRS})` }
  }
  const r = pearson(xs, ys)
  if (r == null) return { insufficient: `${target}: sin variación para correlacionar` }
  const abs = Math.abs(r)
  const strength = abs >= 0.5 ? 'fuerte' : abs >= 0.3 ? 'moderado' : 'débil'
  return {
    target,
    pairs: xs.length,
    r: Math.round(r * 100) / 100,
    direction: r >= 0 ? 'sube' : 'baja',
    strength,
    confidence: xs.length >= 12 && abs >= 0.3 ? 'media' : 'baja',
  }
}

/**
 * Cruza el sueño con energía y ánimo. `sleep`/`energy`/`mood` = puntos con día
 * (YYYY-MM-DD). Solo devuelve links con señal (≥ débil); esconde los que no tienen
 * suficientes pares. Determinístico.
 */
export function analyzeSleepSelfLink(
  sleep: SleepPoint[],
  energy: SelfPoint[],
  mood: SelfPoint[],
): CrossSignalResult {
  const sMap = new Map<string, number>()
  for (const s of sleep) if (Number.isFinite(s.score)) sMap.set(s.day, s.score)
  const eMap = new Map<string, number>()
  for (const e of energy) if (Number.isFinite(e.value)) eMap.set(e.day, e.value)
  const mMap = new Map<string, number>()
  for (const m of mood) if (Number.isFinite(m.value)) mMap.set(m.day, m.value)

  const links: CrossLink[] = []
  const insufficient: string[] = []
  for (const [target, self] of [['energy', eMap], ['mood', mMap]] as const) {
    const res = linkFor(target, sMap, self)
    if ('insufficient' in res) insufficient.push(res.insufficient)
    else if (res.strength !== 'débil' || res.pairs >= 12) links.push(res) // débil solo si hay muchos pares
  }
  // el más fuerte primero
  links.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
  return { links, insufficient }
}
