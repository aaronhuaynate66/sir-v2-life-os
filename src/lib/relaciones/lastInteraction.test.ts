import { describe, it, expect } from 'vitest'
import { buildLastInteraction } from './lastInteraction'

const mem = (over: Partial<{ content: string; title: string }> = {}) =>
  ({ id: 'm', title: over.title ?? '', content: over.content ?? '', importance: 5, tags: [], occurredAt: '2026-06-13' } as never)

describe('buildLastInteraction', () => {
  it('toma fecha de lastContact y texto de la memoria más reciente', () => {
    const r = buildLastInteraction({ lastContact: '2026-06-13', memories: [mem({ content: 'Te saludó por tu cumple; le pediste tus pastillas' })] })
    expect(r.dateISO).toBe('2026-06-13')
    expect(r.text).toContain('cumple')
  })
  it('cae a la nota del log si no hay memoria', () => {
    const r = buildLastInteraction({ lastContact: '2026-06-10', personLogs: [{ id: 'l', kind: 'interaction', value: 4, note: 'Llamada larga', loggedAt: '2026-06-10' } as never] })
    expect(r.text).toBe('Llamada larga')
  })
  it('sin señales → null', () => {
    const r = buildLastInteraction({})
    expect(r.dateISO).toBeNull()
    expect(r.text).toBeNull()
  })
  it('recorta textos largos', () => {
    const r = buildLastInteraction({ memories: [mem({ content: 'x'.repeat(400) })] })
    expect(r.text!.length).toBeLessThanOrEqual(220)
    expect(r.text!.endsWith('…')).toBe(true)
  })
})
