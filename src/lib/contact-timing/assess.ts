// SIR V2 — Motor de TIMING relacional (Parte B). PURO, testeable.
//
// Fusiona las señales de disponibilidad de una persona (contact_activity) en un
// veredicto: ¿es buen o mal momento para contactarla con lo tuyo? Nace del caso
// Dayana: estaba de viaje (story "una escapadita") y Aaron le pidió un favor →
// se estampó. Con la señal registrada, SIR ahora avisa "espera, está de viaje".
//
// FILOSOFÍA (honesta): SIR solo opina cuando SABE algo. Sin señales activas →
// 'neutral' (no inventa disponibilidad). Es un empujón, no una certeza — la
// gente real sorprende. NO usa el ciclo menstrual acá (eso vive en su carril de
// CUIDADO en el chat; meterlo como "no le pidas favores" sería reduccionista).

import type { ContactSignal, ContactSignalKind } from './types'

export type TimingLevel = 'good' | 'neutral' | 'caution' | 'bad'

export interface TimingVerdict {
  level: TimingLevel
  /** Frase corta y humana lista para mostrar. */
  reason: string
  /** La señal que manda el veredicto (para UI/depuración), o null si neutral. */
  drivingKind: ContactSignalKind | null
  /** ISO hasta cuándo aplica (si la señal expira), o null. */
  until: string | null
}

/** TTL por defecto (horas) desde observed_at cuando la señal no trae expires_at. */
const TTL_HOURS: Record<ContactSignalKind, number> = {
  traveling: 72,       // un viaje típico dura días
  busy: 48,
  away: 48,
  focus: 24,
  available: 12,       // "por acá" envejece rápido
  posting_burst: 12,
  job_change: 24 * 21, // un cambio de trabajo pesa ~3 semanas como contexto
  life_event: 24 * 30,
  other: 48,
}

const MS_H = 3_600_000

/** ¿La señal sigue activa a la hora `now`? Usa expires_at, o el TTL por tipo. */
export function isSignalActive(s: ContactSignal, now: number): boolean {
  const observed = Date.parse(s.observedAt)
  if (!Number.isFinite(observed)) return false
  if (s.expiresAt) {
    const exp = Date.parse(s.expiresAt)
    return Number.isFinite(exp) ? now < exp : true
  }
  return now - observed < TTL_HOURS[s.kind] * MS_H
}

// Prioridad: lo que marca MAL momento gana sobre lo que suma a favor.
const LEVEL_OF: Record<ContactSignalKind, TimingLevel> = {
  traveling: 'bad',
  away: 'bad',
  focus: 'bad',
  busy: 'caution',
  job_change: 'caution',
  life_event: 'caution',
  posting_burst: 'good',
  available: 'good',
  other: 'caution',
}

const RANK: Record<TimingLevel, number> = { bad: 3, caution: 2, good: 1, neutral: 0 }

function phraseFor(kind: ContactSignalKind, detail: string | null): string {
  const d = detail && detail.trim() ? ` (${detail.trim()})` : ''
  switch (kind) {
    case 'traveling': return `Está de viaje${d} — mal momento para pedirle algo; espera a que aterrice.`
    case 'away': return `Está fuera/desconectada${d} — mejor espera para escribirle.`
    case 'focus': return `En modo concentración${d} — no es momento de interrumpir.`
    case 'busy': return `Anda a full${d} — si puede esperar, mejor; si no, sé breve y directo.`
    case 'job_change': return `Cambió de trabajo${d} — su foco cambió; buen gancho para reconectar antes de pedir.`
    case 'life_event': return `Está con un tema de vida grande${d} — cuida el enfoque y el timing.`
    case 'posting_burst': return `Está activa ahora${d} — buen momento para escribirle.`
    case 'available': return `Parece por acá y relajada${d} — buen momento.`
    default: return `Hay algo en su momento${d} — tenlo en cuenta.`
  }
}

/**
 * Veredicto de timing a partir de las señales activas. La señal de mayor
 * prioridad manda; entre iguales, la más reciente. PURO.
 */
export function assessContactTiming(signals: ContactSignal[], now: number): TimingVerdict {
  const active = signals.filter((s) => isSignalActive(s, now))
  if (active.length === 0) {
    return { level: 'neutral', reason: '', drivingKind: null, until: null }
  }
  // Ordena por nivel (desc) y, a igual nivel, por más reciente.
  const sorted = [...active].sort((a, b) => {
    const dl = RANK[LEVEL_OF[b.kind]] - RANK[LEVEL_OF[a.kind]]
    if (dl !== 0) return dl
    return Date.parse(b.observedAt) - Date.parse(a.observedAt)
  })
  const top = sorted[0]
  const level = LEVEL_OF[top.kind]
  return {
    level,
    reason: phraseFor(top.kind, top.detail),
    drivingKind: top.kind,
    until: top.expiresAt,
  }
}

/** Línea ultra-compacta para el push/nudge (o '' si neutral/bueno). Solo avisa
 *  cuando conviene FRENAR (bad/caution) — no ensuciamos con los buenos momentos. */
export function timingPushLine(v: TimingVerdict): string {
  if (v.level !== 'bad' && v.level !== 'caution') return ''
  return v.reason
}
