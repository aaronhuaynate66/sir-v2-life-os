// SIR V2 — Señal externa 18·M2: clima → energía/ánimo (confianza media).
//
// El clima de Lima (garúa/gris de invierno) cruzado con tu energía: una racha de
// días grises que COINCIDE con un bajón de energía se muestra como CONTEXTO —
// nunca como excusa ni como causa. Base honesta (doc 18): correlación débil, se
// enuncia con su límite. Y "solo el cambio es señal": el gris de Lima es estable
// año a año, así que el clima SOLO no se muestra; lo que vale es el CRUCE con un
// bajón real tuyo. Motor PURO: la ruta trae el clima (lib/day/weather) y la
// energía (self_metrics) y le pasa las series a assessWeatherMood.

export interface WeatherObservation {
  date: string // YYYY-MM-DD
  /** WMO weathercode (Open-Meteo). null si no hay dato. */
  code: number | null
  precipMm: number | null
}

/** Un punto de energía o ánimo (0-10) por día. */
export interface EnergyPoint {
  date: string
  value: number
}

export type WeatherMoodState = 'gray_streak' | 'mixed' | 'insufficient'

export interface WeatherMoodSignal {
  state: WeatherMoodState
  grayDays: number
  totalDays: number
  /** Energía promedio en los días grises. */
  energyOnGray: number | null
  /** Energía promedio en los días NO grises (línea base). */
  energyBaseline: number | null
  /** onGray - baseline. Negativo = tu energía cae en los días grises. */
  energyDelta: number | null
  /** Pista honesta para mostrar, o null si no hay señal (no molestar). */
  note: string | null
}

const MIN_WEATHER_DAYS = 5
const MIN_GRAY_DAYS = 4
const GRAY_SHARE = 0.5 // ≥50% del período gris = racha
const DIP_THRESHOLD = 1.0 // caída de energía ≥1/10 para considerarla real

/** ¿Un día cuenta como "gris"? Overcast, neblina, garúa, lluvia o precip real. */
export function isGrayDay(obs: WeatherObservation): boolean {
  if (obs.code != null) {
    if (obs.code === 3) return true // cubierto
    if (obs.code >= 45) return true // neblina/garúa/lluvia/chubascos/tormenta
  }
  return (obs.precipMm ?? 0) > 1
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

/**
 * Cruza una racha de clima con la energía de los mismos días. PURO.
 * Devuelve una señal honesta: nota no-null SOLO cuando hay racha gris Y un bajón
 * de energía que coincide (el cruce, no el clima solo).
 */
export function assessWeatherMood(
  weather: WeatherObservation[],
  energy: EnergyPoint[],
): WeatherMoodSignal {
  const days = weather.filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.date))
  const totalDays = days.length
  if (totalDays < MIN_WEATHER_DAYS) {
    return { state: 'insufficient', grayDays: 0, totalDays, energyOnGray: null, energyBaseline: null, energyDelta: null, note: null }
  }

  const energyByDate = new Map<string, number>()
  for (const e of energy) energyByDate.set(e.date, e.value)

  const grayDates = new Set<string>()
  for (const w of days) if (isGrayDay(w)) grayDates.add(w.date)
  const grayDays = grayDates.size

  const grayEnergy: number[] = []
  const clearEnergy: number[] = []
  for (const w of days) {
    const v = energyByDate.get(w.date)
    if (v == null) continue
    if (grayDates.has(w.date)) grayEnergy.push(v)
    else clearEnergy.push(v)
  }
  const energyOnGray = avg(grayEnergy)
  const energyBaseline = avg(clearEnergy)
  const energyDelta =
    energyOnGray != null && energyBaseline != null
      ? Math.round((energyOnGray - energyBaseline) * 10) / 10
      : null

  const isStreak = grayDays >= MIN_GRAY_DAYS && grayDays / totalDays >= GRAY_SHARE
  const state: WeatherMoodState = isStreak ? 'gray_streak' : 'mixed'

  const note = buildNote(state, grayDays, totalDays, energyDelta)
  return { state, grayDays, totalDays, energyOnGray, energyBaseline, energyDelta, note }
}

function buildNote(state: WeatherMoodState, grayDays: number, totalDays: number, delta: number | null): string | null {
  // Sin racha gris → el clima estable de Lima no es señal (no molestar).
  if (state !== 'gray_streak') return null
  // Racha gris pero sin bajón medible → tampoco es señal: no le echamos la culpa al clima.
  if (delta == null || delta > -DIP_THRESHOLD) return null
  const drop = Math.abs(delta)
  return (
    `Vienen ${grayDays} de ${totalDays} días grises (garúa de Lima) y tu energía en esos días ` +
    `viene ~${drop}/10 más abajo que en los despejados. Puede ser CONTEXTO de un bajón, no la causa ` +
    `— el clima no decide tu día. Si igual pesa, un poco de luz/movimiento temprano ayuda.`
  )
}
