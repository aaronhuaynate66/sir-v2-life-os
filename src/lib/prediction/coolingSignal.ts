// SIR V2 — Alerta temprana de enfriamiento del vínculo, desde el sustrato. PURO.
//
// El Pulso (conversation-analytics) es DESCRIPTIVO: dice cómo está la conversación
// HOY (volumen, latencia, tono). Esto es FORWARD-LOOKING: compara una ventana
// RECIENTE contra una BASELINE anterior para detectar que el vínculo se está
// enfriando ANTES de que se corte — tres señales tempranas:
//   1. responde más LENTO que antes (su latencia de respuesta crece),
//   2. VOS iniciás/cargás más que antes (tu share de mensajes sube),
//   3. el volumen cae.
// Es una tendencia, no un juicio: contexto para acercarte a tiempo, no alarma.
// Determinístico, sobre los timestamps del sustrato (sin LLM).

import type { ConvMsg } from '@/lib/conversation-analytics/analyze'

const DAY = 86_400_000
const SESSION_GAP = 6 * 3600_000 // 6h sin mensajes = nueva sesión

export type CoolingStatus = 'enfriándose' | 'estable' | 'insufficient'

export interface WindowStats {
  msgs: number
  days: number
  msgsPerDay: number
  /** Mediana de latencia de respuesta de la OTRA persona (ms), o null. */
  theirReplyMedianMs: number | null
  /** Share de mensajes tuyos en la ventana (0..1). */
  myShare: number
}

export interface CoolingSignal {
  status: CoolingStatus
  /** Razones legibles del enfriamiento (vacío si estable/insufficient). */
  reasons: string[]
  recent: WindowStats | null
  baseline: WindowStats | null
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Stats de una ventana [fromMs, toMs). Latencia = gap cuando la persona
 *  responde a un mensaje TUYO dentro de la misma sesión (≤6h). PURO. */
function windowStats(msgs: ConvMsg[], fromMs: number, toMs: number): WindowStats {
  const win = msgs.filter((m) => m.at >= fromMs && m.at < toMs)
  const days = Math.max(1, (toMs - fromMs) / DAY)
  let byMe = 0
  const latencies: number[] = []
  for (let i = 0; i < win.length; i++) {
    if (win[i].fromMe) byMe++
    if (i > 0) {
      const prev = win[i - 1]
      const cur = win[i]
      const gap = cur.at - prev.at
      // La OTRA persona responde a un mensaje MÍO, dentro de sesión → latencia.
      if (!cur.fromMe && prev.fromMe && gap > 0 && gap <= SESSION_GAP) latencies.push(gap)
    }
  }
  return {
    msgs: win.length,
    days,
    msgsPerDay: win.length / days,
    theirReplyMedianMs: median(latencies),
    myShare: win.length > 0 ? byMe / win.length : 0,
  }
}

/** Mínimo de mensajes por ventana para que la comparación sea confiable. */
const MIN_MSGS = 15
/** Umbrales de enfriamiento. */
const VOLUME_DROP = 0.4 // volumen recíproco cae ≥40%
const LATENCY_RISE = 0.6 // latencia de respuesta sube ≥60%
const SHARE_RISE = 0.15 // tu share sube ≥15 puntos

/**
 * Compara la ventana RECIENTE (últimos `recentDays`) contra la BASELINE
 * (los `baselineDays` previos) y evalúa el enfriamiento. PURO.
 */
export function assessCooling(
  msgs: ConvMsg[],
  now: number = Date.now(),
  recentDays = 30,
  baselineDays = 60,
): CoolingSignal {
  const recentFrom = now - recentDays * DAY
  const baseFrom = recentFrom - baselineDays * DAY
  const recent = windowStats(msgs, recentFrom, now)
  const baseline = windowStats(msgs, baseFrom, recentFrom)

  if (recent.msgs < MIN_MSGS || baseline.msgs < MIN_MSGS) {
    return { status: 'insufficient', reasons: [], recent: null, baseline: null }
  }

  const reasons: string[] = []
  // 1. Volumen cae.
  if (recent.msgsPerDay < baseline.msgsPerDay * (1 - VOLUME_DROP)) {
    reasons.push('se hablan bastante menos que antes')
  }
  // 2. Responde más lento.
  if (
    baseline.theirReplyMedianMs != null &&
    recent.theirReplyMedianMs != null &&
    recent.theirReplyMedianMs > baseline.theirReplyMedianMs * (1 + LATENCY_RISE)
  ) {
    reasons.push('tarda más en responderte que antes')
  }
  // 3. Vos cargás más la conversación.
  if (recent.myShare - baseline.myShare >= SHARE_RISE) {
    reasons.push('estás iniciando/escribiendo tú más que antes')
  }

  return { status: reasons.length > 0 ? 'enfriándose' : 'estable', reasons, recent, baseline }
}
