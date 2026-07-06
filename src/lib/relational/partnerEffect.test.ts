import { describe, it, expect } from 'vitest'
import { computePartnerEffects, isNoiseLog, type InteractionLog } from './partnerEffect'

const NOW = 1_780_000_000_000
const DAY = 86_400_000

function logs(personId: string, name: string, values: number[]): InteractionLog[] {
  return values.map((v, i) => ({ personId, personName: name, value: v, at: NOW - (values.length - i) * DAY }))
}

describe('isNoiseLog', () => {
  it('auto-inferido value=3 = ruido; rating manual o auto no-3 = señal', () => {
    expect(isNoiseLog('Tono inferido del chat importado', 3)).toBe(true)
    expect(isNoiseLog('📞 Llamada de voz · 12 min', 3)).toBe(true)
    expect(isNoiseLog('Importado del export de WhatsApp', 3)).toBe(true)
    expect(isNoiseLog('Tono inferido (tenso)', 2)).toBe(false) // auto pero con señal
    expect(isNoiseLog('reconectamos, fue lindo', 3)).toBe(false) // manual value 3 = genuino
    expect(isNoiseLog(null, 3)).toBe(false)
  })
})

describe('computePartnerEffects', () => {
  it('insufficient con <3 personas elegibles', () => {
    const r = computePartnerEffects([...logs('a', 'A', [5, 5]), ...logs('b', 'B', [1, 1])], NOW)
    expect(r.insufficient).toBe(true)
    expect(r.perPerson).toEqual([])
  })

  it('clasifica energiza / drena / neutral', () => {
    const data = [
      ...logs('a', 'Ana', [5, 5, 5, 5, 5, 5]),
      ...logs('b', 'Beto', [1, 1, 1, 1, 1, 1]),
      ...logs('c', 'Caro', [3, 3, 3, 3]),
    ]
    const r = computePartnerEffects(data, NOW)
    expect(r.insufficient).toBe(false)
    const byId = Object.fromEntries(r.perPerson.map((p) => [p.personId, p]))
    expect(byId.a.label).toBe('energiza')
    expect(byId.b.label).toBe('drena')
    expect(byId.c.label).toBe('neutral')
    // ordenado por vsBaseline desc → Ana primero
    expect(r.perPerson[0].personId).toBe('a')
  })

  it('SHRINKAGE: pocos datos extremos se encogen hacia la media', () => {
    const data = [
      ...logs('a', 'Ana', [4, 4, 4, 4, 4, 4, 4, 4]), // muchos datos moderados
      ...logs('b', 'Beto', [2, 2, 2, 2, 2, 2, 2, 2]),
      ...logs('sparse', 'Sol', [5, 5]), // solo 2 registros, extremos
    ]
    const r = computePartnerEffects(data, NOW)
    const sol = r.perPerson.find((p) => p.personId === 'sparse')!
    // su promedio crudo es 5, pero el estimado se encoge hacia la media general
    expect(sol.rawMean).toBe(5)
    expect(sol.estimate).toBeLessThan(sol.rawMean)
    expect(sol.confidence).toBe('baja')
  })

  it('detecta tendencia del vínculo', () => {
    const declining = logs('d', 'Dani', [5, 4, 3, 2, 1])
    const r = computePartnerEffects([
      ...declining,
      ...logs('a', 'A', [3, 3, 3]),
      ...logs('b', 'B', [4, 4, 4]),
    ], NOW)
    const dani = r.perPerson.find((p) => p.personId === 'd')!
    expect(dani.trend).toBe('baja')
  })
})
