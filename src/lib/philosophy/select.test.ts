import { describe, it, expect } from 'vitest'
import { selectStances, detectTags } from './select'

describe('detectTags', () => {
  it('detecta poder e integridad', () => {
    const t = detectTags('Tengo una reunión con mi jefe por el aumento y no sé si mentir sobre los números')
    expect(t).toContain('poder')
    expect(t).toContain('integridad')
  })
  it('detecta pérdida/dolor', () => {
    expect(detectTags('me duele que se fue, no puedo dejar de pensar')).toContain('perdida')
  })
})

describe('selectStances', () => {
  it('escenario de poder → Maquiavelo entra, y Kant se suma como FRENO', () => {
    const r = selectStances({ situation: 'negociar el aumento con mi jefe, quién tiene el poder en esa reunión' })
    const ids = r.picks.map((p) => p.school.id)
    expect(ids).toContain('maquiavelo')
    expect(ids).toContain('kant')
    const kant = r.picks.find((p) => p.school.id === 'kant')!
    expect(kant.isCheck).toBe(true)
    expect(r.domain).toBe('profesional')
  })

  it('escenario de dolor afectivo → estoicismo / absurdismo, sin freno de poder', () => {
    const r = selectStances({ situation: 'me duele la ruptura y no controlo lo que ella siente' })
    const ids = r.picks.map((p) => p.school.id)
    expect(ids.some((i) => ['estoicismo', 'tao_zen', 'absurdismo'].includes(i))).toBe(true)
    expect(ids).not.toContain('maquiavelo')
    expect(r.domain).toBe('afectivo')
  })

  it('siempre devuelve al menos una corriente + la línea ética', () => {
    const r = selectStances({ situation: 'no sé' })
    expect(r.picks.length).toBeGreaterThanOrEqual(1)
    expect(r.ethicalLine.length).toBeGreaterThan(0)
  })

  it('respeta el dominio forzado', () => {
    expect(selectStances({ situation: 'una decisión', domain: 'afectivo' }).domain).toBe('afectivo')
  })
})
