// SIR V2 — Conexiones de calendario: validación y mapeo (lógica pura, testable).
//
// El API route (server) usa estos helpers para validar el input del usuario y
// mapear filas de `calendar_connections` (snake_case) al DTO del cliente
// (camelCase). Sin red, sin Supabase: 100% determinístico.
//
// SENSIBLE: ics_url lleva un token privado. Estos helpers NO loguean valores.

import {
  CALENDAR_COLORS,
  DEFAULT_CALENDAR_COLOR,
  type CalendarConnectionDto,
} from './types'

const LABEL_MAX = 60
const URL_MAX = 2000

/** Fila cruda de la tabla calendar_connections (las columnas que leemos). */
export interface CalendarConnectionRow {
  id: string
  label: string | null
  provider: string | null
  ics_url: string | null
  color: string | null
  enabled: boolean | null
  created_at: string | null
}

export function rowToDto(row: CalendarConnectionRow): CalendarConnectionDto {
  return {
    id: row.id,
    label: (row.label ?? '').trim() || 'Calendario',
    provider: row.provider ?? 'ics',
    icsUrl: row.ics_url ?? null,
    color: row.color ?? null,
    enabled: row.enabled ?? true,
    createdAt: row.created_at ?? '',
  }
}

/** Limpia un color: debe estar en la paleta; si no, cae al default. */
export function normalizeColor(raw: unknown): string {
  if (typeof raw === 'string' && (CALENDAR_COLORS as readonly string[]).includes(raw)) {
    return raw
  }
  return DEFAULT_CALENDAR_COLOR
}

/** Limpia un label: trim + tope. Vacío → 'Calendario'. */
export function normalizeLabel(raw: unknown): string {
  if (typeof raw !== 'string') return 'Calendario'
  const t = raw.trim().slice(0, LABEL_MAX)
  return t || 'Calendario'
}

export interface ValidatedIcsUrl {
  ok: boolean
  /** URL limpia (trim) si ok. */
  url?: string
  /** Motivo del rechazo (mensaje al usuario; NUNCA incluye la URL). */
  reason?: string
}

/**
 * Valida una URL de feed .ics pegada por el usuario. Acepta http(s) (Outlook,
 * Google, iCloud publican por https; algunos exponen webcal:// que mapeamos a
 * https). Rechaza esquemas no-web. NO incluye la URL en `reason` (sensible).
 */
export function validateIcsUrl(raw: unknown): ValidatedIcsUrl {
  if (typeof raw !== 'string') return { ok: false, reason: 'Falta la URL del calendario.' }
  let t = raw.trim()
  if (!t) return { ok: false, reason: 'Falta la URL del calendario.' }
  if (t.length > URL_MAX) return { ok: false, reason: 'La URL es demasiado larga.' }
  // webcal:// es el esquema de suscripción de Apple/Outlook → es https por debajo.
  if (/^webcal:\/\//i.test(t)) t = t.replace(/^webcal:\/\//i, 'https://')
  let parsed: URL
  try {
    parsed = new URL(t)
  } catch {
    return { ok: false, reason: 'La URL no es válida. Pegá el enlace .ics completo.' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'La URL debe empezar con https:// (o webcal://).' }
  }
  return { ok: true, url: parsed.toString() }
}
