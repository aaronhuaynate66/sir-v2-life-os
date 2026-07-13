import { describe, it, expect } from 'vitest'
import { formatEveningBriefForChat } from './eveningBrief'

describe('formatEveningBriefForChat', () => {
  it('invita a reflexionar y a dictar notas', () => {
    const s = formatEveningBriefForChat()
    expect(s).toMatch(/cómo estuvo tu día/i)
    expect(s).toMatch(/dictámelo|anoto/i)
  })
  it('incluye la línea de hábitos pendientes si viene', () => {
    const s = formatEveningBriefForChat('Te faltan hoy: meditar, leer')
    expect(s).toContain('Te faltan hoy: meditar, leer')
  })
  it('no usa markdown', () => {
    expect(formatEveningBriefForChat('x')).not.toMatch(/[*_#]/)
  })
})
