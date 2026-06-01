// SIR V2 — Parser ICS (iCalendar / RFC 5545), determinístico y sin deps.
//
// Alcance pragmático orientado a un feed publicado de Outlook para una persona
// en Lima:
//   - Unfolding de líneas (continuación con CRLF + espacio/tab).
//   - VEVENT → { uid, summary, dtstart, dtend, location, rrule }.
//   - Fechas: VALUE=DATE (all-day), UTC ('…Z'), y locales/TZID.
//   - RRULE: FREQ DAILY/WEEKLY/MONTHLY/YEARLY con INTERVAL, COUNT, UNTIL y
//     BYDAY (para WEEKLY). Expansión ACOTADA a una ventana [from, to].
//
// TZ Lima (decisión documentada): Lima es UTC-5 FIJO (sin horario de verano
// desde los '90). Por eso los tiempos locales/TZID (sin 'Z') se interpretan
// como America/Lima = UTC-5 y se convierten a UTC sumando 5h. Si el feed
// emite UTC ('Z'), se respeta tal cual. No dependemos de una TZ database.
//
// NUNCA toca red ni Date.now(): la ventana de expansión se inyecta. Así es
// 100% testeable y la capa de feed (feed.ts) le pasa [now, now+horizonte].

import { LIMA_UTC_OFFSET_HOURS } from './tz'
import type { CalendarEvent } from './types'

// ─── Unfolding + parse de líneas ────────────────────────────────────

/** Une las líneas plegadas (RFC 5545 §3.1): una línea que empieza con espacio
 *  o tab es continuación de la anterior. Normaliza CRLF/CR a LF primero. */
export function unfoldLines(raw: string): string[] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const out: string[] = []
  for (const line of normalized.split('\n')) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

interface ParsedLine {
  name: string
  params: Record<string, string>
  value: string
}

/** "DTSTART;TZID=America/Lima:20260601T080000" → {name, params, value}. */
function parseLine(line: string): ParsedLine | null {
  const colon = line.indexOf(':')
  if (colon === -1) return null
  const left = line.slice(0, colon)
  const value = line.slice(colon + 1)
  const parts = left.split(';')
  const name = parts[0].toUpperCase()
  const params: Record<string, string> = {}
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=')
    if (eq !== -1) params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1)
  }
  return { name, params, value }
}

/** Des-escapa texto ICS (\, \; \n …). */
function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

// ─── Fechas ─────────────────────────────────────────────────────────

export interface IcsDate {
  /** ms epoch UTC del instante (medianoche local para all-day). */
  ms: number
  allDay: boolean
}

/**
 * Parsea un valor de fecha/hora ICS a ms epoch UTC.
 *   - "20260601"                → all-day (medianoche Lima de ese día).
 *   - "20260601T130000Z"        → UTC literal.
 *   - "20260601T080000" (+TZID) → local Lima (UTC-5) → UTC.
 * Devuelve null si no matchea.
 */
export function parseIcsDate(value: string, params: Record<string, string> = {}): IcsDate | null {
  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (dateOnly || params.VALUE === 'DATE') {
    const m = dateOnly ?? value.match(/^(\d{4})(\d{2})(\d{2})/)
    if (!m) return null
    const [, y, mo, d] = m
    // All-day anclado a medianoche Lima → UTC = +5h.
    const ms = Date.UTC(+y, +mo - 1, +d, LIMA_UTC_OFFSET_HOURS, 0, 0)
    return { ms, allDay: true }
  }
  const dt = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!dt) return null
  const [, y, mo, d, h, mi, s, z] = dt
  const baseUtc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
  // 'Z' → ya es UTC. Sin 'Z' (local o TZID) → interpretamos Lima (UTC-5):
  // el instante UTC es +5h respecto del reloj local.
  const ms = z ? baseUtc : baseUtc + LIMA_UTC_OFFSET_HOURS * 3600_000
  return { ms, allDay: false }
}

/** ms epoch → 'YYYY-MM-DD' en TZ Lima (para all-day). */
export function toLimaDateOnly(ms: number): string {
  const d = new Date(ms - LIMA_UTC_OFFSET_HOURS * 3600_000)
  return d.toISOString().slice(0, 10)
}

// ─── RRULE ──────────────────────────────────────────────────────────

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
const WEEKDAY_INDEX: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

export interface RRule {
  freq: Freq
  interval: number
  count?: number
  untilMs?: number
  byDay?: number[] // índices 0-6 (Dom-Sáb), para WEEKLY.
}

export function parseRRule(value: string): RRule | null {
  const parts = new Map<string, string>()
  for (const kv of value.split(';')) {
    const eq = kv.indexOf('=')
    if (eq !== -1) parts.set(kv.slice(0, eq).toUpperCase(), kv.slice(eq + 1))
  }
  const freqRaw = parts.get('FREQ')
  if (freqRaw !== 'DAILY' && freqRaw !== 'WEEKLY' && freqRaw !== 'MONTHLY' && freqRaw !== 'YEARLY') {
    return null
  }
  const interval = Math.max(1, parseInt(parts.get('INTERVAL') ?? '1', 10) || 1)
  const countRaw = parts.get('COUNT')
  const count = countRaw ? Math.max(1, parseInt(countRaw, 10) || 1) : undefined
  const untilRaw = parts.get('UNTIL')
  const until = untilRaw ? parseIcsDate(untilRaw) : null
  const byDayRaw = parts.get('BYDAY')
  const byDay = byDayRaw
    ? byDayRaw.split(',').map((d) => WEEKDAY_INDEX[d.trim().slice(-2).toUpperCase()]).filter((n) => n != null)
    : undefined
  return { freq: freqRaw, interval, count, untilMs: until?.ms, byDay: byDay && byDay.length ? byDay : undefined }
}

/** Avanza un instante UTC `n` ocurrencias según freq, preservando hora del día
 *  en UTC (suficiente para Lima, offset fijo). */
function advance(ms: number, freq: Freq, n: number): number {
  if (n === 0) return ms
  const d = new Date(ms)
  switch (freq) {
    case 'DAILY':
      return ms + n * 86_400_000
    case 'WEEKLY':
      return ms + n * 7 * 86_400_000
    case 'MONTHLY':
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())
    case 'YEARLY':
      return Date.UTC(d.getUTCFullYear() + n, d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())
  }
}

const MAX_ITER = 5000

/**
 * Expande una RRULE a los inicios (ms UTC) que caen en [fromMs, toMs].
 * Acotada por COUNT/UNTIL/ventana y un tope duro de iteraciones.
 * Para WEEKLY con BYDAY, expande los días de la semana indicados.
 */
export function expandRecurrence(startMs: number, rule: RRule, fromMs: number, toMs: number): number[] {
  const out: number[] = []
  const hardUntil = rule.untilMs != null ? Math.min(rule.untilMs, toMs) : toMs

  if (rule.freq === 'WEEKLY' && rule.byDay && rule.byDay.length) {
    // Hora del día (UTC) y medianoche del día de inicio.
    const start = new Date(startMs)
    const startDow = start.getUTCDay()
    const startMidnight = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
    const todMs = startMs - startMidnight
    // Medianoche del domingo de la semana de inicio.
    const weekSundayMidnight = startMidnight - startDow * 86_400_000
    const days = [...rule.byDay].sort((a, b) => a - b)
    let emitted = 0
    for (let w = 0; w < MAX_ITER; w++) {
      const weekBase = weekSundayMidnight + w * rule.interval * 7 * 86_400_000
      if (weekBase > hardUntil) break
      for (const dow of days) {
        const occ = weekBase + dow * 86_400_000 + todMs
        if (occ < startMs) continue // antes de DTSTART: no es ocurrencia.
        if (rule.count != null && emitted >= rule.count) return out.sort((a, b) => a - b)
        if (occ > hardUntil) continue
        emitted++
        if (occ >= fromMs) out.push(occ)
      }
    }
    return out.sort((a, b) => a - b)
  }

  // DAILY / WEEKLY-sin-BYDAY / MONTHLY / YEARLY: una ocurrencia por intervalo.
  for (let i = 0; i < MAX_ITER; i++) {
    if (rule.count != null && i >= rule.count) break
    const occ = advance(startMs, rule.freq, i * rule.interval)
    if (occ > hardUntil) break
    if (occ >= fromMs) out.push(occ)
  }
  return out
}

// ─── Parse de VEVENTs ───────────────────────────────────────────────

interface RawEvent {
  uid?: string
  summary?: string
  location?: string
  start?: IcsDate
  end?: IcsDate
  rrule?: RRule
}

function parseEvents(lines: string[]): RawEvent[] {
  const events: RawEvent[] = []
  let cur: RawEvent | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (cur && cur.start) events.push(cur)
      cur = null
      continue
    }
    if (!cur) continue
    const parsed = parseLine(line)
    if (!parsed) continue
    switch (parsed.name) {
      case 'UID':
        cur.uid = parsed.value
        break
      case 'SUMMARY':
        cur.summary = unescapeText(parsed.value)
        break
      case 'LOCATION':
        cur.location = unescapeText(parsed.value)
        break
      case 'DTSTART':
        cur.start = parseIcsDate(parsed.value, parsed.params) ?? undefined
        break
      case 'DTEND':
        cur.end = parseIcsDate(parsed.value, parsed.params) ?? undefined
        break
      case 'RRULE':
        cur.rrule = parseRRule(parsed.value) ?? undefined
        break
    }
  }
  return events
}

export interface ParseIcsOptions {
  /** Ventana inferior (ms UTC). Solo se emiten eventos que empiezan >= from. */
  fromMs: number
  /** Ventana superior (ms UTC). */
  toMs: number
  /** Tope de eventos a devolver tras ordenar. Default 100. */
  limit?: number
}

function toEvent(raw: RawEvent, startMs: number, recurring: boolean): CalendarEvent {
  const allDay = raw.start!.allDay
  const durationMs = raw.end ? raw.end.ms - raw.start!.ms : 0
  const endMs = raw.end ? startMs + durationMs : undefined
  const fmt = (ms: number) => (allDay ? toLimaDateOnly(ms) : new Date(ms).toISOString())
  const uid = raw.uid ?? `${raw.summary ?? 'evento'}-${raw.start!.ms}`
  return {
    id: recurring ? `${uid}@${startMs}` : uid,
    uid,
    title: raw.summary?.trim() || '(sin título)',
    start: fmt(startMs),
    end: endMs != null ? fmt(endMs) : undefined,
    allDay,
    location: raw.location?.trim() || undefined,
    recurring,
  }
}

/**
 * Parsea un documento ICS completo y devuelve los eventos (incluyendo
 * ocurrencias de recurrentes) que empiezan dentro de [fromMs, toMs],
 * ordenados por inicio y acotados a `limit`.
 */
export function parseIcs(text: string, opts: ParseIcsOptions): CalendarEvent[] {
  const { fromMs, toMs, limit = 100 } = opts
  const raws = parseEvents(unfoldLines(text))
  const out: CalendarEvent[] = []

  for (const raw of raws) {
    if (!raw.start) continue
    if (raw.rrule) {
      const occurrences = expandRecurrence(raw.start.ms, raw.rrule, fromMs, toMs)
      for (const occMs of occurrences) out.push(toEvent(raw, occMs, true))
    } else {
      // Evento simple: incluir si su inicio cae en la ventana.
      if (raw.start.ms >= fromMs && raw.start.ms <= toMs) {
        out.push(toEvent(raw, raw.start.ms, false))
      }
    }
  }

  out.sort((a, b) => a.start.localeCompare(b.start))
  return out.slice(0, limit)
}
