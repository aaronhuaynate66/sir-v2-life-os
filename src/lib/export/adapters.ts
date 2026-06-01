// SIR V2 — Adapters de dominio → CSV (Export / data ownership).
//
// Definen columnas con headers claros (español) y valores legibles para
// cada fuente exportable: movimientos financieros, person_logs y
// observations. La serialización/escape la hace buildCsv (csv.ts).

import type { FinancialMovement } from '@/types'
import type { Observation } from '@/lib/capture/observations/types'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'
import { buildCsv, type CsvColumn } from './csv'

// ─── Helpers de formato (deterministas, sin TZ surprises) ───────────

/** "2026-05-30T21:00:00Z" → "2026-05-30 21:00". Date-only → tal cual. */
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/)
  if (!m) return iso
  return m[2] ? `${m[1]} ${m[2]}` : m[1]
}

/** Solo la fecha (YYYY-MM-DD). */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : iso
}

function yesNo(v: boolean): string {
  return v ? 'sí' : 'no'
}

// ─── Finanzas ───────────────────────────────────────────────────────

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
  investment: 'Inversión',
  transfer: 'Transferencia',
  debt: 'Deuda',
}

const FINANCE_COLUMNS: CsvColumn<FinancialMovement>[] = [
  { header: 'Fecha', value: (m) => fmtDate(m.date) },
  { header: 'Tipo', value: (m) => MOVEMENT_TYPE_LABEL[m.type] ?? m.type },
  { header: 'Descripción', value: (m) => m.description },
  { header: 'Categoría', value: (m) => m.category },
  { header: 'Intención', value: (m) => m.intent ?? '' },
  { header: 'Monto', value: (m) => m.amount },
  { header: 'Moneda', value: (m) => m.currency },
  { header: 'Tipo de cambio', value: (m) => m.exchangeRate },
  { header: 'Monto PEN', value: (m) => m.amountPEN },
  { header: 'Recurrente', value: (m) => yesNo(m.recurrent) },
  { header: 'Etiquetas', value: (m) => (m.tags ?? []).join('; ') },
]

export function financeMovementsCsv(movements: FinancialMovement[]): string {
  // Orden cronológico ascendente para un export legible.
  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date))
  return buildCsv(sorted, FINANCE_COLUMNS)
}

// ─── person_logs ────────────────────────────────────────────────────

const LOG_KIND_LABEL: Record<PersonLogKind, string> = {
  mood: 'Ánimo',
  energy: 'Energía',
  sleep: 'Sueño',
  pain: 'Dolor',
  interaction: 'Interacción',
}

const PERSON_LOG_COLUMNS: CsvColumn<PersonLog>[] = [
  { header: 'Fecha', value: (l) => fmtDateTime(l.loggedAt) },
  { header: 'Tipo', value: (l) => LOG_KIND_LABEL[l.kind] ?? l.kind },
  { header: 'Valor (1-5)', value: (l) => l.value },
  { header: 'Nota', value: (l) => l.note },
  { header: 'Registrado', value: (l) => fmtDateTime(l.createdAt) },
]

export function personLogsCsv(logs: PersonLog[]): string {
  const sorted = [...logs].sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
  return buildCsv(sorted, PERSON_LOG_COLUMNS)
}

// ─── observations ───────────────────────────────────────────────────

const OBSERVATION_COLUMNS: CsvColumn<Observation>[] = [
  { header: 'Fecha observada', value: (o) => fmtDateTime(o.observedAt) },
  { header: 'Capturado', value: (o) => fmtDateTime(o.capturedAt) },
  { header: 'Tipo de captura', value: (o) => o.captureType },
  { header: 'Confianza', value: (o) => o.confidence },
  { header: 'Necesita revisión', value: (o) => yesNo(o.needsReview) },
  { header: 'Obsoleta', value: (o) => yesNo(o.isObsolete) },
  // Datos crudos como JSON: data ownership total. buildCsv lo escapa.
  { header: 'Datos (JSON)', value: (o) => JSON.stringify(o.data ?? {}) },
]

export function observationsCsv(observations: Observation[]): string {
  const sorted = [...observations].sort((a, b) =>
    (a.observedAt ?? '').localeCompare(b.observedAt ?? ''),
  )
  return buildCsv(sorted, OBSERVATION_COLUMNS)
}
