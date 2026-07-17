import { describe, it, expect } from 'vitest'
import { rowToContactReminder, sortContactReminders, type ContactReminder } from './types'

describe('rowToContactReminder', () => {
  it('mapea una fila cruda tolerando nulls', () => {
    const r = rowToContactReminder({ id: 'r1', person_id: 'p1', text: 'x', kind: 'standing', status: 'pending', created_at: '2026-07-01', done_at: null })
    expect(r).toMatchObject({ id: 'r1', personId: 'p1', text: 'x', kind: 'standing', status: 'pending', doneAt: null })
  })
  it('defaults seguros para valores raros', () => {
    const r = rowToContactReminder({ id: 'r2', person_id: 'p2', text: 't', kind: 'raro', status: 'raro' })
    expect(r.kind).toBe('once')
    expect(r.status).toBe('pending')
  })
})

describe('sortContactReminders', () => {
  const mk = (id: string, kind: ContactReminder['kind'], createdAt: string): ContactReminder =>
    ({ id, personId: 'p', text: id, kind, status: 'pending', createdAt, doneAt: null })
  it('standing primero, luego once por antigüedad (más viejo arriba)', () => {
    const out = sortContactReminders([
      mk('once-new', 'once', '2026-07-10'),
      mk('standing', 'standing', '2026-07-05'),
      mk('once-old', 'once', '2026-07-01'),
    ])
    expect(out.map((r) => r.id)).toEqual(['standing', 'once-old', 'once-new'])
  })
})
