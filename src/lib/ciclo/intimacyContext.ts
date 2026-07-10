// SIR V2 — Deriva el CONTEXTO relacional para el atunamiento de intimidad (17·M6).
//
// El motor `intimacyGuidance` ya sabe que el CONTEXTO manda sobre la ventana
// hormonal (Nagoski: frenos > fase) — pero solo si le pasás ese contexto. Hasta
// hoy la ficha lo llamaba EN SECO (sin contexto), así que los frenos que más
// pesan (una tensión sin resolver, el vínculo enfriándose, la energía baja) nunca
// se activaban. Este módulo cierra ese hueco: lee señales REALES de `person_logs`
// (tono de las interacciones, mood/energy, cadencia de contacto) y las traduce a
// un `IntimacyContext`. PURO y determinístico — sin LLM, sin fabricar señal.
//
// LÍNEA ÉTICA (doc 17): es para CUIDAR mejor, no para "manejar". Todo lo que sale
// de acá es contexto para acompañar; nunca un diagnóstico de lo que ella siente.

import type { IntimacyContext } from './intimacy'
import { isToneBearingInteraction, isContactInteraction } from '@/lib/person-logs/toneSignal'

const DAY_MS = 86_400_000

/** Ventana de "reciente" para tensión / energía baja (días). */
const RECENT_DAYS = 14
/** Tono 1-5: ≤2 es una interacción TENSA (3 = neutro). */
const TENSE_TONE = 2
/** mood/energy 1-5: ≤2 es un estado BAJO. */
const LOW_STATE = 2

// Enfriamiento por CADENCIA de contacto (proxy honesto desde person_logs, más
// grueso que el motor de chat `assessCooling` pero sobre data ya en la ficha).
const COOL_RECENT_DAYS = 30
const COOL_BASELINE_DAYS = 60
/** Mínimo de contactos en la baseline para animarse a evaluar enfriamiento. */
const COOL_MIN_BASELINE = 4
/** El volumen reciente cae ≥40% respecto de la baseline → enfriándose. */
const COOL_VOLUME_DROP = 0.4

/** Forma mínima de un person_log que necesitamos (subset de PersonLog). */
export interface IntimacyLogInput {
  kind: string
  value: number | null
  note: string | null
  loggedAt: string
}

export interface DeriveIntimacyContextInput {
  /** person_logs de la persona (interaction / mood / energy …). */
  personLogs: IntimacyLogInput[]
  personName?: string
  /** Override explícito de enfriamiento (p.ej. del motor de chat `assessCooling`).
   *  Si se pasa, gana sobre el proxy de cadencia. */
  cooling?: boolean
  now?: Date
}

function tsOf(iso: string): number | null {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/** ¿La cadencia de contacto reciente cayó respecto de la baseline? Proxy grueso,
 *  gateado por volumen mínimo para no gritar "enfriamiento" con poca data. */
function cadenceCooling(logs: IntimacyLogInput[], nowMs: number): boolean {
  const recentFrom = nowMs - COOL_RECENT_DAYS * DAY_MS
  const baseFrom = recentFrom - COOL_BASELINE_DAYS * DAY_MS
  let recent = 0
  let baseline = 0
  for (const l of logs) {
    if (l.kind !== 'interaction') continue
    if (!isContactInteraction(l.note)) continue
    const t = tsOf(l.loggedAt)
    if (t == null) continue
    if (t >= recentFrom && t <= nowMs) recent++
    else if (t >= baseFrom && t < recentFrom) baseline++
  }
  if (baseline < COOL_MIN_BASELINE) return false
  const recentPerDay = recent / COOL_RECENT_DAYS
  const basePerDay = baseline / COOL_BASELINE_DAYS
  return recentPerDay < basePerDay * (1 - COOL_VOLUME_DROP)
}

/**
 * Traduce las señales de `person_logs` a un `IntimacyContext` para alimentar
 * `intimacyGuidance`. Señales:
 *   - recentTension: una interacción con TONO tenso (≤2) en los últimos días.
 *   - lowEnergy: un registro de mood/energy BAJO (≤2) reciente.
 *   - cooling: el contacto viene cayendo (o el override explícito).
 * PURO (`now` inyectable). Sin señal suficiente → flags en false (no inventa).
 */
export function deriveIntimacyContext(input: DeriveIntimacyContextInput): IntimacyContext {
  const now = input.now ?? new Date()
  const nowMs = now.getTime()
  const recentFrom = nowMs - RECENT_DAYS * DAY_MS

  let recentTension = false
  let lowEnergy = false

  for (const l of input.personLogs) {
    const t = tsOf(l.loggedAt)
    if (t == null || t < recentFrom || t > nowMs) continue
    if (typeof l.value !== 'number') continue
    if (
      l.kind === 'interaction' &&
      isToneBearingInteraction(l.note) &&
      l.value <= TENSE_TONE
    ) {
      recentTension = true
    }
    if ((l.kind === 'mood' || l.kind === 'energy') && l.value <= LOW_STATE) {
      lowEnergy = true
    }
  }

  const cooling = input.cooling ?? cadenceCooling(input.personLogs, nowMs)

  return { recentTension, lowEnergy, cooling, personName: input.personName }
}
