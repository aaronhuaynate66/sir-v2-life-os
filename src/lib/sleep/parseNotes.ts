// SIR V2 — Back-fill de la data rica atrapada en sleep_records.notes (SF·F1.5).
//
// Antes de F1, la captura de sueño escribía score/despertares/fases como PROSA
// en `notes` (buildSleepNotes) y nada más. Este parser recupera esos valores del
// texto y los devuelve como campos estructurados, para que las noches viejas
// alimenten F2/F3 sin re-capturar. Es el INVERSO exacto de buildSleepNotes +
// las notas de Apple ("Apple Health · score 92/100").
//
// PURO. Solo RELLENA lo que falta: nunca pisa un valor ya estructurado.

import type { SleepRecord } from '@/types'

export interface ParsedSleepNotes {
  score?: number
  awakenings?: number
  deepMin?: number
  lightMin?: number
  remMin?: number
  awakeMin?: number
}

/** "1h21m" / "1h" / "28m" → minutos. null si no matchea. */
function tokenToMinutes(tok: string | undefined): number | undefined {
  if (!tok) return undefined
  let m = /^(\d+)h(\d+)m$/.exec(tok)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  m = /^(\d+)h$/.exec(tok)
  if (m) return Number(m[1]) * 60
  m = /^(\d+)m$/.exec(tok)
  if (m) return Number(m[1])
  return undefined
}

/** Minutos que siguen a una etiqueta de fase ("Profundo 1h21m"). */
function stageMinutes(notes: string, label: string): number | undefined {
  const re = new RegExp(`${label}\\s+(\\d+h\\d+m|\\d+h|\\d+m)`)
  const m = re.exec(notes)
  return m ? tokenToMinutes(m[1]) : undefined
}

/**
 * Extrae score/despertares/fases del texto de una nota de sueño vieja.
 * Devuelve solo los campos presentes.
 */
export function parseSleepNotes(notes: string | null | undefined): ParsedSleepNotes {
  if (!notes) return {}
  const out: ParsedSleepNotes = {}

  const score = /\bscore (\d{1,3})\/100\b/i.exec(notes)
  if (score) {
    const v = Number(score[1])
    if (v >= 0 && v <= 100) out.score = v
  }

  const awak = /Despertares (\d+)/i.exec(notes)
  if (awak) out.awakenings = Number(awak[1])

  const deep = stageMinutes(notes, 'Profundo')
  const light = stageMinutes(notes, 'Liviano')
  const rem = stageMinutes(notes, 'REM')
  const awake = stageMinutes(notes, 'Vigilia')
  if (deep !== undefined) out.deepMin = deep
  if (light !== undefined) out.lightMin = light
  if (rem !== undefined) out.remMin = rem
  if (awake !== undefined) out.awakeMin = awake

  return out
}

/**
 * Rellena los campos estructurados FALTANTES de un SleepRecord a partir de su
 * `notes`. Idempotente y no destructivo: si el campo ya existe, lo respeta.
 * Devuelve el mismo objeto si no había nada que rescatar (referencia estable).
 */
export function enrichSleepRecord(record: SleepRecord): SleepRecord {
  const needs =
    record.score === undefined ||
    record.awakenings === undefined ||
    record.deepMin === undefined ||
    record.lightMin === undefined ||
    record.remMin === undefined ||
    record.awakeMin === undefined
  if (!needs) return record

  const p = parseSleepNotes(record.notes)
  if (Object.keys(p).length === 0) return record

  return {
    ...record,
    score: record.score ?? p.score,
    awakenings: record.awakenings ?? p.awakenings,
    deepMin: record.deepMin ?? p.deepMin,
    lightMin: record.lightMin ?? p.lightMin,
    remMin: record.remMin ?? p.remMin,
    awakeMin: record.awakeMin ?? p.awakeMin,
  }
}

/** enrichSleepRecord sobre una lista. */
export function enrichSleepRecords(records: SleepRecord[]): SleepRecord[] {
  return records.map(enrichSleepRecord)
}
