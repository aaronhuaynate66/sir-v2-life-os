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

export interface CadenceSuggestion {
  days: number
  /** 'rhythm' = inferida del ritmo real; 'category' = default por capa (poca señal). */
  source: 'rhythm' | 'category'
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/**
 * Cadencia "automática" inferida del RITMO real de contacto: la mediana de los
 * gaps (en días) entre contactos, deduplicando mismo día. Sólo cuando hay señal
 * ROBUSTA — al menos `minContacts` contactos que abarquen `minSpanDays` — para
 * no inventar un ritmo con 2 capturas de la misma semana. Si no, cae al default
 * por categoría. PURO (`now` inyectable).
 */
export function suggestCadenceDays(
  contactDates: Array<string | number | Date | null | undefined>,
  category: PersonCategory,
  now: Date = new Date(),
  opts: { minContacts?: number; minSpanDays?: number } = {},
): CadenceSuggestion {
  const minContacts = opts.minContacts ?? 5
  const minSpanDays = opts.minSpanDays ?? 45
  const fallback = contactFrequencyDays('', category)

  const nowMs = now.getTime()
  const dayKeys = new Set<number>()
  for (const d of contactDates) {
    if (d == null) continue
    const ms = d instanceof Date ? d.getTime() : typeof d === 'number' ? d : Date.parse(String(d))
    if (!Number.isFinite(ms) || ms > nowMs) continue
    dayKeys.add(Math.floor(ms / 86_400_000))
  }
  const days = [...dayKeys].sort((a, b) => a - b)
  if (days.length < minContacts) return { days: fallback, source: 'category' }
  const span = days[days.length - 1] - days[0]
  if (span < minSpanDays) return { days: fallback, source: 'category' }

  const gaps: number[] = []
  for (let i = 1; i < days.length; i++) gaps.push(days[i] - days[i - 1])
  const clamped = Math.max(1, Math.min(365, Math.round(median(gaps))))
  return { days: clamped, source: 'rhythm' }
}

export interface EffectiveCadence {
  days: number
  isAuto: boolean
  /** 'explicit' = el usuario la fijó; 'rhythm' = auto por ritmo; 'category' = auto por capa. */
  source: 'explicit' | 'rhythm' | 'category'
}

/**
 * Cadencia efectiva de una persona: el texto explícito MANDA; si está en
 * automática (vacío), usa la sugerencia por ritmo cuando existe, si no el
 * default por categoría.
 */
export function effectiveCadenceDays(
  freqText: string | undefined | null,
  category: PersonCategory,
  suggestion?: CadenceSuggestion | null,
): EffectiveCadence {
  const raw = (freqText ?? '').trim()
  if (raw !== '') return { days: contactFrequencyDays(raw, category), isAuto: false, source: 'explicit' }
  if (suggestion) return { days: suggestion.days, isAuto: true, source: suggestion.source }
  return { days: contactFrequencyDays('', category), isAuto: true, source: 'category' }
}

export interface CadenceDescription {
  /** Meta de contacto en días (resuelta: explícita, por ritmo, o por categoría). */
  days: number
  /** ¿Es automática (texto vacío)? */
  isAuto: boolean
  /** 'explicit' | 'rhythm' | 'category'. */
  source: EffectiveCadence['source']
  /** "cada 7 días" · "cada 9 días · tu ritmo" · "cada 30 días · auto". */
  label: string
}

/**
 * Describe la cadencia efectiva de una persona (para mostrarla). Si se pasa una
 * `suggestion` (ritmo real inferido server-side), la usa para el modo automático.
 */
export function describeCadence(
  freqText: string | undefined | null,
  category: PersonCategory,
  suggestion?: CadenceSuggestion | null,
): CadenceDescription {
  const eff = effectiveCadenceDays(freqText, category, suggestion)
  const label =
    eff.source === 'rhythm' ? `cada ${eff.days} días · tu ritmo`
      : eff.source === 'category' ? `cada ${eff.days} días · auto`
        : `cada ${eff.days} días`
  return { days: eff.days, isAuto: eff.isAuto, source: eff.source, label }
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
