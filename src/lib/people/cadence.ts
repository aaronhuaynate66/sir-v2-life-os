// SIR V2 — Cadencia de contacto por persona (P1 backlog Clay #2). PURO.
//
// La cadencia = cada cuánto QUERÉS mantener contacto con alguien. V2 ya guardaba
// esto como texto libre en `people.contact_frequency`, y el engine de urgencia lo
// parsea (`lib/people/urgency` → `contactFrequencyDays`) para decir si estás al
// día o atrasado. Acá NO agregamos un campo nuevo: seguimos escribiendo el mismo
// `contact_frequency`, sólo que lo hacemos ELEGIBLE (presets, incluida
// "Automática") y VISIBLE (etiqueta + estado atrasado/al día). Determinístico.

import type { PersonCategory } from '@/types'
import { contactFrequencyDays } from './urgency'

export interface CadencePreset {
  /** Valor guardado en `contact_frequency` (parseable por el engine). Sentinel de UI. */
  value: 'auto' | 'diario' | 'semanal' | 'quincenal' | 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual' | 'custom'
  label: string
}

// Nota: el <Select> no admite value="" (Radix), por eso 'auto' es el sentinel de
// "automática" y se traduce a '' al guardar (ver `presetToStored`).
export const CADENCE_PRESETS: CadencePreset[] = [
  { value: 'auto', label: 'Automática (por categoría)' },
  { value: 'diario', label: 'Diario' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
  { value: 'custom', label: 'Personalizado (cada N días)' },
]

/** Palabras de preset que el engine ya sabe parsear (sin 'auto'/'custom'). */
const PRESET_WORDS = new Set([
  'diario', 'semanal', 'quincenal', 'mensual', 'bimestral', 'trimestral', 'semestral', 'anual',
])

/**
 * Del texto guardado en `contact_frequency` al valor del <Select>:
 *   '' → 'auto', palabra conocida → esa palabra, cualquier otra cosa → 'custom'.
 */
export function storedToPreset(freqText: string | undefined | null): CadencePreset['value'] {
  const raw = (freqText ?? '').trim().toLowerCase()
  if (raw === '') return 'auto'
  if (PRESET_WORDS.has(raw)) return raw as CadencePreset['value']
  return 'custom'
}

/** Del valor del <Select> al texto que se guarda ('auto' → '', 'custom' → caller decide). */
export function presetToStored(value: CadencePreset['value'], customDays?: number): string {
  if (value === 'auto') return ''
  if (value === 'custom') {
    const n = Math.max(1, Math.min(365, Math.round(customDays ?? 21)))
    return `cada ${n} días`
  }
  return value
}

/** Extrae N de un valor personalizado "cada N días". null si no matchea. */
export function parseCustomDays(freqText: string | undefined | null): number | null {
  const m = (freqText ?? '').trim().toLowerCase().match(/cada\s+(\d{1,3})\s*d[ií]as?/)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : null
}

export interface CadenceDescription {
  /** Meta de contacto en días (resuelta, ya con fallback por categoría). */
  days: number
  /** ¿Es automática (texto vacío → default por categoría)? */
  isAuto: boolean
  /** "cada 7 días" o "cada 30 días · auto". */
  label: string
}

/** Describe la cadencia efectiva de una persona (para mostrarla). */
export function describeCadence(
  freqText: string | undefined | null,
  category: PersonCategory,
): CadenceDescription {
  const raw = (freqText ?? '').trim()
  const days = contactFrequencyDays(raw, category)
  const isAuto = raw === ''
  return { days, isAuto, label: isAuto ? `cada ${days} días · auto` : `cada ${days} días` }
}

export type CadenceState = 'sin_registro' | 'al_dia' | 'atrasado'

export interface CadenceStatus {
  state: CadenceState
  /** Días pasados de la meta (>0 sólo si atrasado). */
  overdueDays: number
  label: string
}

/**
 * Estado de la cadencia hoy: al día, atrasado (por cuánto) o sin registro.
 * `daysSinceContact` null = no hay ni un contacto registrado.
 */
export function cadenceStatus(daysSinceContact: number | null, freqDays: number): CadenceStatus {
  if (daysSinceContact === null) return { state: 'sin_registro', overdueDays: 0, label: 'sin registro' }
  const overdueDays = daysSinceContact - freqDays
  if (overdueDays > 0) return { state: 'atrasado', overdueDays, label: `atrasado ${overdueDays}d` }
  return { state: 'al_dia', overdueDays: 0, label: 'al día' }
}
