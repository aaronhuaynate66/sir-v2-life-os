// SIR V2 — Tests de "qué le importa" (15·8).

import { describe, it, expect } from 'vitest'
import { extractWhatMatters } from './whatMatters'

describe('extractWhatMatters', () => {
  it('saca temas que se repiten (≥2 memorias)', () => {
    const mems = [
      'Hablamos de taekwondo, entrena todos los días.',
      'Me contó que compite en taekwondo el finde.',
      'Le apasiona la fotografía de paisajes.',
    ]
    const r = extractWhatMatters(mems)
    const terms = r.themes.map((t) => t.term)
    expect(terms).toContain('taekwondo') // aparece en 2 → recurrente
    expect(terms).not.toContain('fotografia') // aparece en 1 → no recurrente
  })
  it('ordena por frecuencia', () => {
    const mems = ['ciclismo montaña', 'ciclismo ruta', 'ciclismo carrera', 'montaña nieve']
    const r = extractWhatMatters(mems, { minCount: 2 })
    expect(r.themes[0].term).toBe('ciclismo')
    expect(r.themes[0].count).toBe(3)
  })
  it('excluye stopwords y números', () => {
    const r = extractWhatMatters(['tiene que estar para las 2020', 'para estar bien 2020'])
    expect(r.themes.map((t) => t.term)).not.toContain('para')
    expect(r.themes.map((t) => t.term)).not.toContain('2020')
  })
  it('excluye el nombre de la persona', () => {
    const r = extractWhatMatters(['Alex ama el golf', 'Alex juega golf siempre'], { excludeName: 'Alex Heilbrunn' })
    const terms = r.themes.map((t) => t.term)
    expect(terms).not.toContain('alex')
    expect(terms).toContain('golf')
  })
  it('una memoria repetitiva no infla el conteo (cuenta 1 por memoria)', () => {
    const r = extractWhatMatters(['golf golf golf golf'], { minCount: 1 })
    const golf = r.themes.find((t) => t.term === 'golf')
    expect(golf?.count).toBe(1)
  })
  it('respeta el cap max', () => {
    const mems = Array.from({ length: 20 }, (_, i) => `palabra${i} palabra${i}`)
    const r = extractWhatMatters(mems, { max: 5 })
    expect(r.themes.length).toBeLessThanOrEqual(5)
  })
  it('sin memorias → sin temas, sin romper', () => {
    expect(extractWhatMatters([]).themes).toHaveLength(0)
  })
  it('pasa los tags curados', () => {
    expect(extractWhatMatters([], { tags: ['inversor', 'padre'] }).tags).toEqual(['inversor', 'padre'])
  })
})
