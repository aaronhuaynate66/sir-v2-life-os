// SIR V2 — El integrador (#7 del deck "Arquitectura y rumbo"): cruza un PATRÓN
// de laboratorio con el resto de tu salud DIARIA en la MISMA ventana temporal.
//
// Hasta hoy SIR detectaba la tendencia crónica de un analito (labPatterns) pero
// la dejaba sola. Esto la conecta: ¿qué más de tu cuerpo se movió mientras ese
// valor subía/bajaba? Honesto por diseño: reporta CO-OCURRENCIA (qué cambió al
// mismo tiempo), nunca causalidad — "en ese período tu peso subió", no "por eso".
// PURO y testeable. La guarda: solo reporta métricas que se movieron por encima
// del ruido (delta claro), y necesita ≥2 puntos en la ventana.

export interface DailyPoint {
  type: string
  value: number
  /** YYYY-MM-DD */
  date: string
}

export interface CrossSignal {
  type: string
  label: string
  dir: 'up' | 'down'
  /** Ej. "+2.1 kg" o "−8 ms". */
  deltaText: string
}

interface Tracked { type: string; label: string; unit: string; noise: number; decimals: number }

// Métricas diarias que valen para cruzar con un patrón de lab. `noise` = mínimo
// movimiento para no reportar ruido. FC del sueño y FC reposo comparten label →
// se reporta una sola (la primera con datos).
const TRACKED: Tracked[] = [
  { type: 'weight', label: 'peso', unit: 'kg', noise: 0.8, decimals: 1 },
  { type: 'sleeping_heart_rate', label: 'FC en reposo', unit: 'lpm', noise: 2, decimals: 0 },
  { type: 'heart_rate', label: 'FC en reposo', unit: 'lpm', noise: 2, decimals: 0 },
  { type: 'hrv_avg', label: 'VFC', unit: 'ms', noise: 4, decimals: 0 },
  { type: 'respiratory_rate', label: 'respiración', unit: 'rpm', noise: 1, decimals: 0 },
]

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/**
 * Co-movimiento de las métricas diarias dentro de la ventana [from,to] del patrón
 * de lab. Compara el promedio de los primeros vs últimos puntos (robusto al ruido
 * de un día). Solo devuelve las que se movieron claramente. PURO.
 */
export function crossLabPattern(window: { from: string; to: string }, daily: DailyPoint[]): CrossSignal[] {
  if (!window.from || !window.to || window.to < window.from) return []
  const out: CrossSignal[] = []
  const seenLabel = new Set<string>()
  for (const m of TRACKED) {
    if (seenLabel.has(m.label)) continue
    const pts = daily
      .filter((d) => d.type === m.type && d.date >= window.from && d.date <= window.to && Number.isFinite(d.value))
      .sort((a, b) => a.date.localeCompare(b.date))
    if (pts.length < 2) continue
    const k = Math.max(1, Math.min(3, Math.floor(pts.length / 2)))
    const delta = avg(pts.slice(-k).map((p) => p.value)) - avg(pts.slice(0, k).map((p) => p.value))
    if (Math.abs(delta) < m.noise) continue
    seenLabel.add(m.label)
    const mag = Math.abs(delta).toFixed(m.decimals)
    out.push({ type: m.type, label: m.label, dir: delta > 0 ? 'up' : 'down', deltaText: `${delta > 0 ? '+' : '−'}${mag} ${m.unit}` })
  }
  return out
}

/** Línea honesta de co-ocurrencia para mostrar bajo el patrón. null si nada se movió. PURO. */
export function formatCrossLine(signals: CrossSignal[]): string | null {
  if (signals.length === 0) return null
  return 'En ese mismo período: ' + signals.map((s) => `${s.label} ${s.deltaText}`).join(' · ') + '.'
}
