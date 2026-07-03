// SIR V2 — Tests de la capa pura de disparo de recordatorios vencidos.

import { describe, it, expect } from 'vitest'
import { selectDue, reminderNotice, type DueReminder } from './due'

const NOW = Date.parse('2026-07-03T20:00:00Z')

function r(over: Partial<DueReminder> = {}): DueReminder {
  return { id: 'r1', text: 'llamar a Alex', due_at: '2026-07-03T19:00:00Z', done_at: null, notified_at: null, ...over }
}

describe('selectDue', () => {
  it('incluye vencido, sin resolver y sin avisar', () => {
    expect(selectDue([r()], NOW)).toHaveLength(1)
  })
  it('excluye si aún no vence', () => {
    expect(selectDue([r({ due_at: '2026-07-03T21:00:00Z' })], NOW)).toHaveLength(0)
  })
  it('excluye si ya está hecho', () => {
    expect(selectDue([r({ done_at: '2026-07-03T19:30:00Z' })], NOW)).toHaveLength(0)
  })
  it('excluye si ya se avisó', () => {
    expect(selectDue([r({ notified_at: '2026-07-03T19:15:00Z' })], NOW)).toHaveLength(0)
  })
  it('excluye due_at inparseable', () => {
    expect(selectDue([r({ due_at: 'basura' })], NOW)).toHaveLength(0)
  })
  it('incluye el vencido justo ahora (borde <=)', () => {
    expect(selectDue([r({ due_at: '2026-07-03T20:00:00Z' })], NOW)).toHaveLength(1)
  })
})

describe('reminderNotice', () => {
  it('sin persona → título genérico + deep-link a /panel', () => {
    const n = reminderNotice(r())
    expect(n.title).toBe('Recordatorio')
    expect(n.body).toBe('llamar a Alex')
    expect(n.url).toBe('/panel')
  })
  it('con persona → título con nombre + deep-link a la ficha', () => {
    const n = reminderNotice(r({ person_name: 'Alex Heilbrunn', person_slug: 'alex-heilbrunn' }))
    expect(n.title).toBe('Recordatorio · Alex Heilbrunn')
    expect(n.url).toBe('/relaciones/alex-heilbrunn')
  })
})
