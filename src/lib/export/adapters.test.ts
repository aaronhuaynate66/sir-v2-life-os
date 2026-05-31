// SIR V2 — Tests de los adapters CSV de dominio (Export).
//
// Verifican headers, formato de fechas, labels en español, orden
// cronológico y escape de casos borde reales (descripción con comas,
// notas con comillas, tags).

import { describe, it, expect } from 'vitest'

import type { FinancialMovement } from '@/types'
import type { Observation } from '@/lib/capture/observations/types'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'
import { financeMovementsCsv, personLogsCsv, observationsCsv } from './adapters'

function mov(over: Partial<FinancialMovement>): FinancialMovement {
  return {
    id: over.id ?? 'm1',
    type: over.type ?? 'expense',
    amount: over.amount ?? 100,
    currency: over.currency ?? 'PEN',
    exchangeRate: over.exchangeRate ?? 1,
    amountPEN: over.amountPEN ?? 100,
    category: over.category ?? 'other',
    description: over.description ?? '',
    date: over.date ?? '2026-05-01',
    recurrent: over.recurrent ?? false,
    tags: over.tags ?? [],
    ...over,
  }
}

let seq = 0
function plog(over: Partial<PersonLog>): PersonLog {
  seq += 1
  return {
    id: over.id ?? `l${seq}`,
    userId: 'u',
    personId: 'p',
    kind: over.kind ?? 'mood',
    value: over.value ?? 3,
    note: over.note ?? null,
    loggedAt: over.loggedAt ?? '2026-05-01T10:00:00Z',
    createdAt: over.createdAt ?? '2026-05-01T10:00:00Z',
    ...over,
  }
}

function obs(over: Partial<Observation>): Observation {
  return {
    id: over.id ?? 'o1',
    userId: 'u',
    personId: over.personId ?? 'p',
    captureType: over.captureType ?? 'whatsapp_chat',
    sourceImagePath: null,
    storageBucket: null,
    data: over.data ?? {},
    detectorData: null,
    userEdits: null,
    confidence: over.confidence ?? 'high',
    needsReview: over.needsReview ?? false,
    observedAt: over.observedAt ?? '2026-05-01T12:00:00Z',
    capturedAt: over.capturedAt ?? '2026-05-02T08:30:00Z',
    isObsolete: over.isObsolete ?? false,
    obsoletedAt: null,
    obsoletedReason: null,
    createdAt: '2026-05-02T08:30:00Z',
    ...over,
  }
}

describe('financeMovementsCsv', () => {
  it('vacío → solo headers', () => {
    expect(financeMovementsCsv([])).toBe(
      'Fecha,Tipo,Descripción,Categoría,Monto,Moneda,Tipo de cambio,Monto PEN,Recurrente,Etiquetas',
    )
  })

  it('label en español, fecha date-only, tags con ; y orden cronológico', () => {
    const csv = financeMovementsCsv([
      mov({ id: 'b', type: 'income', date: '2026-05-10', amount: 500, amountPEN: 500, description: 'Sueldo', tags: ['fijo', 'trabajo'] }),
      mov({ id: 'a', type: 'expense', date: '2026-05-01', amount: 30, amountPEN: 30, description: 'Café' }),
    ])
    const lines = csv.split('\r\n')
    // ascendente: primero 05-01
    expect(lines[1]).toBe('2026-05-01,Gasto,Café,other,30,PEN,1,30,no,')
    expect(lines[2]).toBe('2026-05-10,Ingreso,Sueldo,other,500,PEN,1,500,no,fijo; trabajo')
  })

  it('escapa descripción con coma y comillas', () => {
    const csv = financeMovementsCsv([
      mov({ description: 'Almuerzo, con "extra"', date: '2026-05-01' }),
    ])
    expect(csv.split('\r\n')[1]).toContain('"Almuerzo, con ""extra"""')
  })
})

describe('personLogsCsv', () => {
  it('vacío → solo headers', () => {
    expect(personLogsCsv([])).toBe('Fecha,Tipo,Valor (1-5),Nota,Registrado')
  })

  it('formatea timestamp a "YYYY-MM-DD HH:mm", traduce kind, nota null → vacía', () => {
    const csv = personLogsCsv([
      plog({
        kind: 'interaction' as PersonLogKind,
        value: 4,
        loggedAt: '2026-05-03T18:45:00Z',
        createdAt: '2026-05-03T18:45:00Z',
        note: null,
      }),
    ])
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('2026-05-03 18:45,Interacción,4,,2026-05-03 18:45')
  })

  it('nota con salto de línea se entrecomilla', () => {
    const csv = personLogsCsv([plog({ note: 'una\notra', loggedAt: '2026-05-01T10:00:00Z' })])
    expect(csv.split('Valor (1-5),Nota,Registrado\r\n')[1]).toContain('"una\notra"')
  })

  it('ordena ascendente por loggedAt', () => {
    const csv = personLogsCsv([
      plog({ id: 'late', loggedAt: '2026-05-05T10:00:00Z', value: 5 }),
      plog({ id: 'early', loggedAt: '2026-05-01T10:00:00Z', value: 1 }),
    ])
    const lines = csv.split('\r\n')
    expect(lines[1].startsWith('2026-05-01')).toBe(true)
    expect(lines[2].startsWith('2026-05-05')).toBe(true)
  })
})

describe('observationsCsv', () => {
  it('vacío → solo headers', () => {
    expect(observationsCsv([])).toBe(
      'Fecha observada,Capturado,Tipo de captura,Confianza,Necesita revisión,Obsoleta,Datos (JSON)',
    )
  })

  it('serializa data como JSON escapado y formatea fechas/booleanos', () => {
    const csv = observationsCsv([
      obs({ data: { name: 'Ana, B', city: 'Lima' }, confidence: 'medium', needsReview: true }),
    ])
    const line = csv.split('\r\n')[1]
    expect(line).toContain('2026-05-01 12:00')
    expect(line).toContain('2026-05-02 08:30')
    expect(line).toContain('medium')
    expect(line).toContain('sí') // needsReview
    expect(line).toContain('no') // isObsolete
    // JSON con coma interna → entrecomillado + comillas duplicadas
    expect(line).toContain('"{""name"":""Ana, B"",""city"":""Lima""}"')
  })
})
