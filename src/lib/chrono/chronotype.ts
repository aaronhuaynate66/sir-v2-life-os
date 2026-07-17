// SIR V2 — Cronotipo + jet-lag social (11·M2 + 11·M4). PURO.
//
// M2: el PUNTO MEDIO DE SUEÑO (bedtime + duración/2) ubica a Aaron en el eje
// alondra↔búho — descriptivo ("tu centro de sueño cae ~03:30"), no una etiqueta
// rígida. Honesto: <14 noches con horario → insufficient; si la varianza es
// enorme, no hay patrón que declarar.
// M4: compara el punto medio de días LABORALES vs LIBRES (finde). Un desfase
// >1h es "jet-lag social" — causa CANDIDATA del bajón del lunes, correlación no
// ley. Necesita contraste laboral/libre.

const MIN_NIGHTS = 14
const HH = /^(\d{2}):(\d{2})$/

export interface NightRow {
  /** 'YYYY-MM-DD' del despertar. */
  date: string
  /** 'HH:MM' hora de dormir. */
  bedtime: string
  /** Horas dormidas. */
  duration: number
}

function hmToMin(hm: string): number | null {
  const m = HH.exec(hm ?? '')
  if (!m) return null
  const h = Number(m[1]); const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Punto medio de sueño en minutos desde medianoche (clock time), o null. */
function midSleep(row: NightRow): number | null {
  const bed = hmToMin(row.bedtime)
  if (bed === null || (bed === 0 && row.duration === 0)) return null
  if (bed === 0) return null // fallback '00:00' sin horario real
  if (!Number.isFinite(row.duration) || row.duration <= 0) return null
  return (bed + row.duration * 30) % 1440 // duración/2 en minutos = h*30
}

function mean(nums: number[]): number { return nums.reduce((a, b) => a + b, 0) / nums.length }
function sd(nums: number[]): number {
  const m = mean(nums)
  return Math.sqrt(mean(nums.map((n) => (n - m) ** 2)))
}
function toHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = Math.round(min % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
/** Sáb/Dom (por día de despertar) ≈ noche libre (puedes dormir de más). */
function isFreeDay(date: string): boolean {
  const t = Date.parse(`${date}T12:00:00Z`)
  if (!Number.isFinite(t)) return false
  const d = new Date(t).getUTCDay()
  return d === 0 || d === 6
}

export type ChronotypePosition = 'alondra' | 'intermedio' | 'búho'

export interface Chronotype {
  /** Punto medio de sueño promedio (minutos desde medianoche), o null. */
  midSleepMinutes: number | null
  /** 'HH:MM' legible, o null. */
  midSleepLabel: string | null
  position: ChronotypePosition | null
  nights: number
  /** true si el patrón es inestable (varianza alta): reportamos con cautela. */
  unstable: boolean
  sufficient: boolean
}

/** Ubica el cronotipo desde los horarios reales. Usa noches libres si hay ≥5;
 *  si no, todas (descriptivo, no clínico). */
export function computeChronotype(rows: NightRow[]): Chronotype {
  const all = rows.map((r) => ({ mid: midSleep(r), free: isFreeDay(r.date) }))
    .filter((r): r is { mid: number; free: boolean } => r.mid !== null)

  // La SUFICIENCIA se mide sobre el total de noches con horario válido.
  if (all.length < MIN_NIGHTS) {
    return { midSleepMinutes: null, midSleepLabel: null, position: null, nights: all.length, unstable: false, sufficient: false }
  }
  // El VALOR prefiere días libres (cronotipo más puro), o todos si hay pocos.
  const free = all.filter((r) => r.free).map((r) => r.mid)
  const used = free.length >= 5 ? free : all.map((r) => r.mid)

  const avg = Math.round(mean(used))
  const unstable = sd(used) > 150 // >2.5h de dispersión = sin patrón estable
  const position: ChronotypePosition = avg < 150 ? 'alondra' : avg > 270 ? 'búho' : 'intermedio' // <02:30 / >04:30
  return { midSleepMinutes: avg, midSleepLabel: toHHMM(avg), position, nights: all.length, unstable, sufficient: true }
}

export interface SocialJetlag {
  workMidLabel: string | null
  freeMidLabel: string | null
  /** Desfase absoluto en minutos (|libre − laboral|), o null. */
  offsetMinutes: number | null
  significant: boolean
  message: string | null
  sufficient: boolean
}

const JETLAG_THRESHOLD = 60

/** Jet-lag social: punto medio laboral vs libre. Necesita ≥2 noches libres y
 *  ≥3 laborales. PURO. */
export function computeSocialJetlag(rows: NightRow[]): SocialJetlag {
  const work: number[] = []; const free: number[] = []
  for (const r of rows) {
    const mid = midSleep(r)
    if (mid === null) continue
    if (isFreeDay(r.date)) free.push(mid); else work.push(mid)
  }
  if (free.length < 2 || work.length < 3) {
    return { workMidLabel: null, freeMidLabel: null, offsetMinutes: null, significant: false, message: null, sufficient: false }
  }
  const w = Math.round(mean(work)); const f = Math.round(mean(free))
  const offset = Math.abs(f - w)
  const significant = offset > JETLAG_THRESHOLD
  const message = significant
    ? `Tu centro de sueño se corre ~${Math.round(offset / 60 * 10) / 10}h del finde (${toHHMM(f)}) a la semana (${toHHMM(w)}). Ese "jet-lag social" suele coincidir con el bajón del lunes — no es causa probada, pero mirá de acercar los horarios.`
    : null
  return { workMidLabel: toHHMM(w), freeMidLabel: toHHMM(f), offsetMinutes: offset, significant, message, sufficient: true }
}
