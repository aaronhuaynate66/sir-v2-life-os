import { describe, it, expect } from 'vitest'
import { profileMaturity } from './maturity'
import type { Memory } from '@/types'

const mk = (source: Memory['source'], n = 1): Pick<Memory, 'source'>[] =>
  Array.from({ length: n }, () => ({ source }))

describe('profileMaturity', () => {
  it('sin memorias → naciente, base vacía', () => {
    const m = profileMaturity([])
    expect(m.level).toBe('naciente')
    expect(m.count).toBe(0)
    expect(m.basis).toBe('')
    expect(m.groundedShare).toBe(0)
    expect(m.nextStep).toMatch(/Deriva/)
  })

  it('pocas memorias → naciente', () => {
    expect(profileMaturity(mk('whatsapp_capture', 3)).level).toBe('naciente')
  })

  it('volumen medio → en formación', () => {
    expect(profileMaturity([...mk('whatsapp_capture', 4), ...mk('inferred', 3)]).level).toBe('en_formacion')
  })

  it('muchas pero casi todas inferidas → NO sube (en formación) y avisa la base débil', () => {
    const m = profileMaturity([...mk('inferred', 11), ...mk('whatsapp_capture', 1)])
    expect(m.level).toBe('en_formacion')
    expect(m.nextStep).toMatch(/inferencias/i)
  })

  it('10+ con base fundada ≥40% → sólido', () => {
    const m = profileMaturity([...mk('whatsapp_capture', 5), ...mk('manual', 1), ...mk('inferred', 6)])
    expect(m.count).toBe(12)
    expect(m.groundedShare).toBeCloseTo(0.5, 5)
    expect(m.level).toBe('solido')
  })

  it('20+ bien fundadas → profundo, sin siguiente paso', () => {
    const m = profileMaturity([...mk('whatsapp_capture', 14), ...mk('manual', 4), ...mk('inferred', 4)])
    expect(m.count).toBe(22)
    expect(m.level).toBe('profundo')
    expect(m.nextStep).toBe('')
  })

  it('desglosa la base y cuenta cada origen', () => {
    const m = profileMaturity([...mk('whatsapp_capture', 2), ...mk('manual', 1), ...mk('inferred', 1)])
    expect(m.fromChat).toBe(2)
    expect(m.fromManual).toBe(1)
    expect(m.fromInferred).toBe(1)
    expect(m.basis).toBe('2 de tu chat · 1 que anotaste · 1 inferida')
  })

  it('source sin registrar cuenta como "sin origen" (no fundada)', () => {
    const m = profileMaturity(mk(undefined, 4))
    expect(m.fromUnknown).toBe(4)
    expect(m.groundedShare).toBe(0)
    expect(m.basis).toContain('sin origen')
  })
})
