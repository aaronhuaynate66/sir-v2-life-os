import { describe, it, expect } from 'vitest'
import { buildRumboInput, parseRumboNarrative } from './rumboPrompt'

describe('rumboPrompt', () => {
  it('buildRumboInput lista los hitos con fecha y exige usar solo esos', () => {
    const msg = buildRumboInput([
      { label: 'Lograste “X”', date: '2026-06-05T00:00:00Z', kind: 'done' },
      { label: 'Te propusiste “Y”', date: '2026-05-01T00:00:00Z', kind: 'set' },
    ])
    expect(msg).toContain('2026-06-05 · Lograste “X”')
    expect(msg).toContain('2026-05-01 · Te propusiste “Y”')
    expect(msg.toLowerCase()).toContain('solo usá estos hitos')
  })

  it('parseRumboNarrative extrae el insight del JSON', () => {
    expect(parseRumboNarrative('{"insight":"Venís sosteniendo un rumbo."}')).toBe('Venís sosteniendo un rumbo.')
  })

  it('parseRumboNarrative tolera texto crudo y vacío', () => {
    expect(parseRumboNarrative('reflexión sin json')).toBe('reflexión sin json')
    expect(parseRumboNarrative('')).toBeNull()
    expect(parseRumboNarrative('   ')).toBeNull()
  })
})
