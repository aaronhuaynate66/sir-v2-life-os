// SIR V2 — Tests del rescate de notas del ciclo (DD).

import { describe, it, expect } from 'vitest'
import { cycleEntriesWithNotes } from './notes'
import type { PersonCycleEntry } from './types'

function entry(p: Partial<PersonCycleEntry>): PersonCycleEntry {
  return {
    id: p.id ?? 'e', personId: 'diana', date: p.date ?? '2026-07-01',
    phase: p.phase ?? 'luteal', confidence: p.confidence ?? 'medium',
    source: p.source ?? 'aaron', note: p.note ?? null, createdAt: '2026-07-01T00:00:00Z',
  }
}

describe('cycleEntriesWithNotes', () => {
  it('devuelve solo los registros con nota no vacía', () => {
    const r = cycleEntriesWithNotes([
      entry({ id: 'a', note: 'vino con cólicos' }),
      entry({ id: 'b', note: null }),
      entry({ id: 'c', note: '   ' }),
      entry({ id: 'd', note: 'mejor ánimo' }),
    ])
    expect(r.map((e) => e.id)).toEqual(['a', 'd'])
  })

  it('ordena por fecha descendente (más reciente primero)', () => {
    const r = cycleEntriesWithNotes([
      entry({ id: 'vieja', date: '2026-06-01', note: 'x' }),
      entry({ id: 'nueva', date: '2026-07-10', note: 'y' }),
      entry({ id: 'media', date: '2026-06-20', note: 'z' }),
    ])
    expect(r.map((e) => e.id)).toEqual(['nueva', 'media', 'vieja'])
  })

  it('lista vacía si nada tiene nota', () => {
    expect(cycleEntriesWithNotes([entry({ note: null }), entry({ note: '' })])).toHaveLength(0)
  })
})
