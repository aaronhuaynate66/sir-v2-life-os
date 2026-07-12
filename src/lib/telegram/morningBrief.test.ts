import { describe, it, expect } from 'vitest'
import { formatMorningBriefForChat } from './morningBrief'

describe('formatMorningBriefForChat', () => {
  it('arma un mensaje cálido con el cuerpo del brief y un CTA', () => {
    const s = formatMorningBriefForChat({ title: 'Tu día en SIR', body: 'María cumple mañana · Foco: cerrar el trato' })
    expect(s).toMatch(/buen día/i)
    expect(s).toContain('María cumple mañana')
    expect(s).toContain('Foco: cerrar el trato')
    expect(s).toMatch(/escribime/i)
  })

  it('funciona aunque el cuerpo venga vacío', () => {
    const s = formatMorningBriefForChat({ title: 'Buenos días', body: '' })
    expect(s).toMatch(/buen día/i)
    expect(s).toMatch(/escribime/i)
  })

  it('no usa markdown (Telegram lo muestra crudo)', () => {
    const s = formatMorningBriefForChat({ title: 'x', body: 'algo importante' })
    expect(s).not.toMatch(/[*_#]/)
  })
})
