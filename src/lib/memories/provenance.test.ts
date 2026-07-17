import { describe, it, expect } from 'vitest'
import { memoryProvenance } from './provenance'

describe('memoryProvenance', () => {
  it('manual → certeza (lo dijo Aaron)', () => {
    const p = memoryProvenance('manual')
    expect(p.confidence).toBe('certain')
    expect(p.confidenceLabel).toBe('confirmado por ti')
    expect(p.icon).toBe('manual')
  })
  it('whatsapp_capture → alta (de una conversación real)', () => {
    const p = memoryProvenance('whatsapp_capture')
    expect(p.confidence).toBe('high')
    expect(p.label).toBe('de tu chat')
    expect(p.icon).toBe('chat')
  })
  it('inferred → media (derivada por SIR)', () => {
    const p = memoryProvenance('inferred')
    expect(p.confidence).toBe('medium')
    expect(p.icon).toBe('inferred')
  })
  it('sin source → incierta (legado)', () => {
    const p = memoryProvenance(undefined)
    expect(p.confidence).toBe('unknown')
    expect(p.icon).toBe('unknown')
  })
})
