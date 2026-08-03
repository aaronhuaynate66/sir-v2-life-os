import { describe, it, expect } from 'vitest'
import { summarizeLedger } from './summary'
import type { Suggestion } from './types'

const s = (o: Partial<Suggestion>): Suggestion => ({
  id: 'x', surface: 'chat', kind: 'answer', title: null, status: 'pending',
  feedback: null, outcome: null, createdAt: '', resolvedAt: null, ...o,
})

describe('summarizeLedger', () => {
  it('cuenta total, resueltas, outcomes, feedback y workRate', () => {
    const r = summarizeLedger([
      s({ kind: 'contact', status: 'done', outcome: 'worked' }),
      s({ kind: 'contact', status: 'dismissed' }),
      s({ kind: 'crear_objetivo', status: 'pending', feedback: 'up' }),
      s({ kind: 'answer', outcome: 'didnt', feedback: 'down' }),
    ])
    expect(r.total).toBe(4)
    expect(r.resolved).toBe(2) // done + dismissed
    expect(r.worked).toBe(1)
    expect(r.didnt).toBe(1)
    expect(r.up).toBe(1)
    expect(r.down).toBe(1)
    expect(r.workRate).toBe(50) // 1 worked / (1+1)
    expect(r.byKind[0]).toEqual({ kind: 'contact', count: 2 })
  })
  it('workRate null si nada tiene outcome medido', () => {
    expect(summarizeLedger([s({}), s({ feedback: 'up' })]).workRate).toBeNull()
  })
  it('ledger vacío', () => {
    const r = summarizeLedger([])
    expect(r.total).toBe(0)
    expect(r.byKind).toEqual([])
  })

  // El estado real al 3-ago: 15 sugerencias, 11 de ellas ignoradas hasta 12 días.
  // `workRate` sola diría "100 % de acierto" con un solo hit; `followRate` no.
  it('followRate cuenta las ignoradas; workRate no', () => {
    const r = summarizeLedger([
      s({ kind: 'contact', status: 'done', outcome: 'worked' }),
      ...Array.from({ length: 3 }, () => s({ kind: 'contact', status: 'done', outcome: 'ignored' })),
    ])
    expect(r.worked).toBe(1)
    expect(r.ignored).toBe(3)
    expect(r.didnt).toBe(0)
    expect(r.workRate).toBe(100) // 1/(1+0) — la vista optimista
    expect(r.followRate).toBe(25) // 1/(1+0+3) — la honesta
  })

  it('ignored NO se mezcla con didnt', () => {
    const r = summarizeLedger([s({ outcome: 'ignored' }), s({ outcome: 'didnt' })])
    expect(r.ignored).toBe(1)
    expect(r.didnt).toBe(1)
  })

  it('followRate null mientras nada se haya cerrado', () => {
    expect(summarizeLedger([s({}), s({ feedback: 'up' })]).followRate).toBeNull()
  })
})
