// SIR V2 — Registro de plata por persona (tipos + resumen puro).
export type MoneyDirection = 'out' | 'in'   // out=Aaron→persona, in=persona→Aaron
export type MoneyKind = 'transfer' | 'loan' | 'balance'

export interface MoneyEntry {
  id: string
  personId: string
  direction: MoneyDirection
  amount: number
  currency: string
  concept: string | null
  kind: MoneyKind
  occurredOn: string | null   // YYYY-MM-DD
  occurredTime: string | null
  opRef: string | null
  settled: boolean
}

interface RawRow { id: string; person_id: string; direction: string; amount: number | string; currency: string; concept: string | null; kind: string; occurred_on: string | null; occurred_time: string | null; op_ref: string | null; settled: boolean }
export function mapMoneyRow(r: RawRow): MoneyEntry {
  return {
    id: r.id, personId: r.person_id,
    direction: r.direction === 'in' ? 'in' : 'out',
    amount: Number(r.amount) || 0,
    currency: r.currency || 'PEN',
    concept: r.concept,
    kind: r.kind === 'loan' ? 'loan' : r.kind === 'balance' ? 'balance' : 'transfer',
    occurredOn: r.occurred_on ? r.occurred_on.slice(0, 10) : null,
    occurredTime: r.occurred_time, opRef: r.op_ref, settled: !!r.settled,
  }
}

export interface MoneySummary {
  out: number   // total que le pasaste
  in: number    // total que te devolvió/pagó
  net: number   // out - in (positivo = te debe)
  count: number
}
/** Resumen sobre una moneda (default PEN). Los 'balance' no se suman al neto
 *  de transferencias salvo que lo pidas; acá los contamos como saldo informativo. */
export function summarizeMoney(entries: MoneyEntry[], currency = 'PEN'): MoneySummary {
  const e = entries.filter((x) => x.currency === currency)
  const out = e.filter((x) => x.direction === 'out').reduce((a, b) => a + b.amount, 0)
  const inc = e.filter((x) => x.direction === 'in').reduce((a, b) => a + b.amount, 0)
  return { out: Math.round(out * 100) / 100, in: Math.round(inc * 100) / 100, net: Math.round((out - inc) * 100) / 100, count: e.length }
}
