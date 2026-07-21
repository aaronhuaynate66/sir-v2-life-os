import { describe, it, expect } from 'vitest'
import { formatMorningBriefForChat } from './morningBrief'

describe('formatMorningBriefForChat', () => {
  it('arma un mensaje cálido con el cuerpo del brief y un CTA', () => {
    const s = formatMorningBriefForChat({ title: 'Tu día en SIR', body: 'María cumple mañana · Foco: cerrar el trato' })
    expect(s).toMatch(/buen día/i)
    expect(s).toContain('María cumple mañana')
    expect(s).toContain('Foco: cerrar el trato')
    expect(s).toMatch(/escríbeme/i)
  })

  it('funciona aunque el cuerpo venga vacío', () => {
    const s = formatMorningBriefForChat({ title: 'Buenos días', body: '' })
    expect(s).toMatch(/buen día/i)
    expect(s).toMatch(/escríbeme/i)
  })

  it('no usa markdown (Telegram lo muestra crudo)', () => {
    const s = formatMorningBriefForChat({ title: 'x', body: 'algo importante' })
    expect(s).not.toMatch(/[*_#]/)
  })

  it('prefiere bodyFull (completo) sobre body (capado) cuando viene', () => {
    const s = formatMorningBriefForChat({
      title: 'Tu día en SIR',
      body: 'Nudge largo… ', // capado, con el "…" del push
      bodyFull: 'Nudge largo · Hoy vence: Pedir las pastillas para la cabeza',
    })
    expect(s).toContain('Hoy vence: Pedir las pastillas para la cabeza')
    expect(s).not.toContain('…')
  })

  it('cae al body si no hay bodyFull (retrocompat)', () => {
    const s = formatMorningBriefForChat({ title: 'x', body: 'solo body' })
    expect(s).toContain('solo body')
  })
})
