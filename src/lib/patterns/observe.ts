// SIR V2 — "Patrones observados" (PURO, determinístico). NO predice: describe
// asociaciones en la data que YA existe, con GUARDA DE MUESTRA dura. Si no hay
// suficientes días, NO opina (devuelve nada) en vez de inventar correlaciones.
//
// Método (transparente, no caja negra): para un par driver→outcome continuos,
// partimos los días por la MEDIANA del driver (días "bajos" vs "altos") y
// comparamos el promedio del outcome entre ambos grupos. Para un flag binario
// (ej. día de migraña sí/no), comparamos el outcome entre los dos grupos.
// Solo emitimos si: días alineados >= MIN_DAYS y cada grupo >= MIN_PER_GROUP y
// la diferencia supera el umbral del par.

export interface DayPoint { date: string; value: number }

export interface Observation {
  id: string
  text: string
  n: number
  strength: 'leve' | 'clara'
}

const MIN_DAYS = 10
const MIN_PER_GROUP = 4

/** Promedio por día (YYYY-MM-DD) a partir de puntos con fecha/timestamp. */
export function dailyAvg(points: { date?: string; timestamp?: string; value: number }[]): DayPoint[] {
  const by = new Map<string, { sum: number; n: number }>()
  for (const p of points) {
    const d = (p.date ?? p.timestamp ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(p.value)) continue
    const e = by.get(d) ?? { sum: 0, n: 0 }
    e.sum += p.value; e.n += 1; by.set(d, e)
  }
  return [...by.entries()].map(([date, e]) => ({ date, value: e.sum / e.n })).sort((a, b) => a.date.localeCompare(b.date))
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function avg(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length }

export interface CompareResult { n: number; nLow: number; nHigh: number; avgLow: number; avgHigh: number; delta: number; threshold: number }

/** Driver continuo → outcome continuo, partido por mediana del driver. */
export function compareContinuous(driver: DayPoint[], outcome: DayPoint[]): CompareResult | null {
  const om = new Map(outcome.map((p) => [p.date, p.value]))
  const pairs = driver.map((d) => ({ x: d.value, y: om.get(d.date) })).filter((p): p is { x: number; y: number } => typeof p.y === 'number')
  if (pairs.length < MIN_DAYS) return null
  const med = median(pairs.map((p) => p.x))
  const low = pairs.filter((p) => p.x <= med).map((p) => p.y)
  const high = pairs.filter((p) => p.x > med).map((p) => p.y)
  if (low.length < MIN_PER_GROUP || high.length < MIN_PER_GROUP) return null
  const avgLow = avg(low), avgHigh = avg(high)
  return { n: pairs.length, nLow: low.length, nHigh: high.length, avgLow, avgHigh, delta: avgHigh - avgLow, threshold: 0 }
}

/** Outcome continuo comparado entre días con flag (set de fechas) y sin flag. */
export function compareBinary(outcome: DayPoint[], flagDates: Set<string>): CompareResult | null {
  const on = outcome.filter((p) => flagDates.has(p.date)).map((p) => p.value)
  const off = outcome.filter((p) => !flagDates.has(p.date)).map((p) => p.value)
  if (outcome.length < MIN_DAYS || on.length < MIN_PER_GROUP || off.length < MIN_PER_GROUP) return null
  const avgOn = avg(on), avgOff = avg(off)
  // avgLow = sin flag, avgHigh = con flag (para reusar el shape).
  return { n: outcome.length, nLow: off.length, nHigh: on.length, avgLow: avgOff, avgHigh: avgOn, delta: avgOn - avgOff, threshold: 0 }
}

export interface ObserveInput {
  sleepHours: DayPoint[]
  mood: DayPoint[]
  energy: DayPoint[]
  stress: DayPoint[]
  restingHr: DayPoint[]
  migraineDays: Set<string> // días con ≥1 pastilla de migraña
}

const f1 = (n: number) => (Math.round(n * 10) / 10).toString()

/** Corre un set fijo de pares y devuelve solo las observaciones con muestra y
 *  efecto suficientes. Cada par define su umbral leve/clara. */
export function observePatterns(inp: ObserveInput): Observation[] {
  const out: Observation[] = []
  const push = (id: string, r: CompareResult | null, lev: number, cla: number, mk: (r: CompareResult) => string) => {
    if (!r) return
    const mag = Math.abs(r.delta)
    if (mag < lev) return
    out.push({ id, text: mk(r), n: r.n, strength: mag >= cla ? 'clara' : 'leve' })
  }
  // Sueño → ánimo / energía (escala 1-5: leve 0.4, clara 0.8)
  push('sueno-animo', compareContinuous(inp.sleepHours, inp.mood), 0.4, 0.8, (r) =>
    `Las noches que dormiste más, tu ánimo al día siguiente promedió ${f1(r.avgHigh)}/5 vs ${f1(r.avgLow)}/5 cuando dormiste menos.`)
  push('sueno-energia', compareContinuous(inp.sleepHours, inp.energy), 0.4, 0.8, (r) =>
    `Dormir más se asoció con más energía: ${f1(r.avgHigh)}/5 vs ${f1(r.avgLow)}/5 las noches cortas.`)
  push('sueno-estres', compareContinuous(inp.sleepHours, inp.stress), 0.4, 0.8, (r) =>
    `Las noches cortas vinieron con más estrés (${f1(r.avgLow)}/5 dormiste más → ${f1(r.avgHigh)}/5 menos, ojo el sentido).`)
  // Migraña (binario) → sueño / energía / ánimo (horas: leve 0.5h clara 1h; 1-5: 0.4/0.8)
  push('migrana-sueno', compareBinary(inp.sleepHours, inp.migraineDays), 0.5, 1, (r) =>
    `Los días de migraña dormiste ${f1(r.avgHigh)}h en promedio, vs ${f1(r.avgLow)}h los demás.`)
  push('migrana-energia', compareBinary(inp.energy, inp.migraineDays), 0.4, 0.8, (r) =>
    `En días de migraña tu energía promedió ${f1(r.avgHigh)}/5 vs ${f1(r.avgLow)}/5 sin migraña.`)
  // FC reposo → energía
  push('fc-energia', compareContinuous(inp.restingHr, inp.energy), 0.4, 0.8, (r) =>
    `Con FC en reposo más alta, tu energía promedió ${f1(r.avgHigh)}/5 vs ${f1(r.avgLow)}/5 con FC más baja.`)
  return out
}


// ─── Madurez de datos (para el futuro predictivo) ───
// Forecasting confiable necesita VOLUMEN. Acá medimos cuántos días ÚTILES hay
// por cruce vs los que hacen falta, para mostrar el progreso (sin predecir).
export const FORECAST_MIN_DAYS = 30

export interface ReadinessRow { id: string; label: string; have: number; need: number; pct: number }

function alignedCount(a: DayPoint[], b: DayPoint[]): number {
  const bd = new Set(b.map((p) => p.date))
  return a.filter((p) => bd.has(p.date)).length
}

export function dataReadiness(inp: ObserveInput): ReadinessRow[] {
  const need = FORECAST_MIN_DAYS
  const mk = (id: string, label: string, have: number): ReadinessRow => ({ id, label, have, need, pct: Math.min(100, Math.round((have / need) * 100)) })
  return [
    mk('sueno-animo', 'Sueño + ánimo', alignedCount(inp.sleepHours, inp.mood)),
    mk('sueno-energia', 'Sueño + energía', alignedCount(inp.sleepHours, inp.energy)),
    mk('fc-energia', 'FC + energía', alignedCount(inp.restingHr, inp.energy)),
    mk('migrana-energia', 'Migraña + energía', inp.energy.length),
  ]
}
