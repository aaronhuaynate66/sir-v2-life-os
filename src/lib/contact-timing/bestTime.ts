// SIR V2 — "Mejor momento para escribirle a X" (Frente B, PURO). PROACTIVO.
//
// Predice si AHORA es buen momento y cuáles son sus ventanas activas, usando SOLO
// los timestamps del historial de chat que SIR ya tiene — sin scraping, sin
// espiar, siempre disponible. Base (deep-research 19/07, 25/25 claims confirmados):
//   - RECENCIA = el predictor individual MÁS FUERTE de recibir respuesta (>2x el
//     segundo factor) → pesa fuerte.
//   - Ritmo circadiano con MÚLTIPLES picos, POR-PERSONA (no una sola hora óptima)
//     → histograma de SUS mensajes por hora local, detecta ventanas.
//   - Burstiness (Hawkes): las conversaciones se agrupan → si hay actividad muy
//     reciente, está "en racha" y es momento óptimo.
// Honesto: con poco historial → 'unknown' (no inventa un ritmo).

export interface ChatEvent {
  /** true = lo mandó Aaron; false = lo mandó la otra persona. */
  fromUser: boolean
  /** ISO del mensaje. */
  at: string
}

export type RhythmLevel = 'now' | 'good' | 'ok' | 'low' | 'unknown'

export interface ActiveWindow {
  startHour: number // hora local 0-23 (inclusive)
  endHour: number   // hora local 0-23 (inclusive)
}

export interface RhythmVerdict {
  level: RhythmLevel
  /** 0..1 — cuán buen momento es AHORA. */
  score: number
  /** Frase corta lista para mostrar. */
  reason: string
  /** Sus ventanas activas típicas (hora local). */
  activeWindows: ActiveWindow[]
  /** Texto de su próxima ventana ("suele estar activa de noche (20–22h)"), o null. */
  nextWindowText: string | null
  /** Horas desde su último mensaje entrante, o null si nunca escribió. */
  recencyHours: number | null
  /** ¿Está en racha de conversación ahora? */
  inBurst: boolean
  /** Cuántos mensajes suyos se usaron (confianza). */
  sampleSize: number
}

const MS_H = 3_600_000
/** Mínimo de mensajes SUYOS para arriesgar una predicción de ritmo. */
const MIN_SAMPLE = 8
/** Lima (UTC-5) por defecto; los timestamps se asumen UTC. Ajustable. */
const DEFAULT_TZ_OFFSET_MIN = -300

function localHour(iso: string, tzOffsetMin: number): number | null {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.floor(((t + tzOffsetMin * 60_000) % 86_400_000 + 86_400_000) % 86_400_000 / MS_H)
}

function windowLabel(startHour: number): string {
  if (startHour < 6) return 'de madrugada'
  if (startHour < 12) return 'en la mañana'
  if (startHour < 14) return 'al mediodía'
  if (startHour < 19) return 'en la tarde'
  return 'en la noche'
}
const pad = (h: number) => `${h.toString().padStart(2, '0')}h`

/** Detecta ventanas pico: horas con conteo > 1.2× el promedio (y ≥2), fusiona
 *  las contiguas (envuelve 23→0). */
function peakWindows(hourCounts: number[]): ActiveWindow[] {
  const total = hourCounts.reduce((a, b) => a + b, 0)
  if (total === 0) return []
  const mean = total / 24
  const isPeak = hourCounts.map((c) => c >= 2 && c > mean * 1.2)
  const windows: ActiveWindow[] = []
  let start = -1
  for (let h = 0; h < 24; h++) {
    if (isPeak[h] && start === -1) start = h
    else if (!isPeak[h] && start !== -1) { windows.push({ startHour: start, endHour: h - 1 }); start = -1 }
  }
  if (start !== -1) windows.push({ startHour: start, endHour: 23 })
  // Fusiona wrap 23→0.
  if (windows.length >= 2 && windows[0].startHour === 0 && windows[windows.length - 1].endHour === 23) {
    const first = windows.shift()!
    windows[windows.length - 1].endHour = first.endHour + 24 // marca wrap
  }
  return windows
}

function inWindow(hour: number, w: ActiveWindow): boolean {
  if (w.endHour >= 24) return hour >= w.startHour || hour <= w.endHour - 24
  return hour >= w.startHour && hour <= w.endHour
}

/**
 * Analiza el ritmo de contacto de una persona y dice si AHORA es buen momento.
 * PURO. `nowMs` = Date.now() del caller; `tzOffsetMin` = offset local (def. Lima).
 */
export function analyzeContactRhythm(events: ChatEvent[], nowMs: number, tzOffsetMin = DEFAULT_TZ_OFFSET_MIN): RhythmVerdict {
  const theirs = events.filter((e) => !e.fromUser && Number.isFinite(Date.parse(e.at)))
  const sampleSize = theirs.length

  // Recencia + burst se pueden estimar aun con poco historial.
  const lastTheir = theirs.reduce<number>((mx, e) => Math.max(mx, Date.parse(e.at)), 0)
  const recencyHours = lastTheir > 0 ? (nowMs - lastTheir) / MS_H : null
  const recentAll = events.filter((e) => { const t = Date.parse(e.at); return Number.isFinite(t) && nowMs - t < 1.5 * MS_H })
  const inBurst = recentAll.length >= 2 && recencyHours !== null && recencyHours < 1.5

  if (sampleSize < MIN_SAMPLE) {
    // Sin ritmo confiable: solo hablamos si hay actividad muy fresca.
    if (inBurst) return { level: 'now', score: 0.9, reason: 'Están en conversación ahora — momento ideal.', activeWindows: [], nextWindowText: null, recencyHours, inBurst, sampleSize }
    return { level: 'unknown', score: 0, reason: '', activeWindows: [], nextWindowText: null, recencyHours, inBurst, sampleSize }
  }

  const hourCounts = new Array(24).fill(0)
  for (const e of theirs) { const h = localHour(e.at, tzOffsetMin); if (h !== null) hourCounts[h]++ }
  const windows = peakWindows(hourCounts)
  const nowHour = localHour(new Date(nowMs).toISOString(), tzOffsetMin) ?? 0
  const isActiveHourNow = windows.some((w) => inWindow(nowHour, w))

  // Próxima ventana (para cuando NO es buen momento ahora).
  let nextWindowText: string | null = null
  if (windows.length > 0) {
    const starts = windows.map((w) => w.startHour % 24).sort((a, b) => a - b)
    const next = starts.find((s) => s > nowHour) ?? starts[0]
    const w = windows.find((x) => x.startHour % 24 === next)!
    nextWindowText = `suele estar activa ${windowLabel(next)} (${pad(next)}–${pad((w.endHour % 24) + 1 > 23 ? 23 : (w.endHour % 24) + 1)})`
  }

  // Score: recencia domina, +hora activa, +burst.
  let score = 0
  if (recencyHours !== null) {
    if (recencyHours < 1) score += 0.6
    else if (recencyHours < 6) score += 0.45
    else if (recencyHours < 24) score += 0.3
    else if (recencyHours < 72) score += 0.15
  }
  if (isActiveHourNow) score += 0.35
  if (inBurst) score += 0.25
  score = Math.min(1, score)

  let level: RhythmLevel
  let reason: string
  if (inBurst || (recencyHours !== null && recencyHours < 1)) {
    level = 'now'; reason = 'Está activa ahora — momento ideal para escribirle.'
  } else if (isActiveHourNow || (recencyHours !== null && recencyHours < 12)) {
    level = 'good'; reason = isActiveHourNow ? 'Es una de sus horas activas — buen momento.' : 'Escribió hace poco — sigue por acá.'
  } else if (score >= 0.15) {
    level = 'ok'; reason = nextWindowText ? `No es su hora pico, pero puede ver; ${nextWindowText}.` : 'Momento neutro.'
  } else {
    level = 'low'; reason = nextWindowText ? `No suele estar activa a esta hora — ${nextWindowText}.` : 'No suele estar activa a esta hora.'
  }

  return { level, score, reason, activeWindows: windows, nextWindowText, recencyHours, inBurst, sampleSize }
}
