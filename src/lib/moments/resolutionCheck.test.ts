import { describe, it, expect } from 'vitest'
import { buildResolutionInput, parseResolutionVerdicts, suggestedResolutions } from './resolutionCheck'

describe('buildResolutionInput', () => {
  it('lista los temas con su id y el chat cronológico', () => {
    const msg = buildResolutionInput(
      [{ id: 'm1', title: 'Examen del seguro', detail: 'pendiente resultados' }],
      'Diana',
      [{ who: 'Diana', date: '2026-07-17', text: 'ya me llegaron los resultados, todo bien' }],
    )
    expect(msg).toContain('[id: m1] Examen del seguro — pendiente resultados')
    expect(msg).toContain('[2026-07-17] Diana: ya me llegaron los resultados')
  })
})

describe('parseResolutionVerdicts', () => {
  it('parsea y acota a ids válidos', () => {
    const raw = 'texto [{"momentId":"m1","resolved":true,"evidence":"ya me llegaron","confidence":"high"},{"momentId":"XX","resolved":true,"evidence":"x","confidence":"high"}] fin'
    const out = parseResolutionVerdicts(raw, ['m1'])
    expect(out).toHaveLength(1)
    expect(out[0].momentId).toBe('m1')
    expect(out[0].resolved).toBe(true)
  })
  it('JSON inválido → []', () => {
    expect(parseResolutionVerdicts('no json', ['m1'])).toEqual([])
  })
  it('confidence rara → low', () => {
    const out = parseResolutionVerdicts('[{"momentId":"m1","resolved":false,"evidence":"","confidence":"???"}]', ['m1'])
    expect(out[0].confidence).toBe('low')
  })
})

describe('suggestedResolutions', () => {
  it('solo resueltas con confianza no-baja y evidencia', () => {
    const s = suggestedResolutions([
      { momentId: 'a', resolved: true, evidence: 'clarísimo', confidence: 'high' },
      { momentId: 'b', resolved: true, evidence: 'x', confidence: 'low' },       // baja → fuera
      { momentId: 'c', resolved: false, evidence: '', confidence: 'high' },       // no resuelta → fuera
      { momentId: 'd', resolved: true, evidence: '', confidence: 'high' },        // sin evidencia → fuera
    ])
    expect(s.map((v) => v.momentId)).toEqual(['a'])
  })
})
