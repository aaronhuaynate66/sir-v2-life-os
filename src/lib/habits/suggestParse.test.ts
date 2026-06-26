import { describe, it, expect } from 'vitest'
import { parseHabitSuggestions } from './suggestParse'

describe('parseHabitSuggestions', () => {
  it('parsea array válido y recorta a 2', () => {
    const t = JSON.stringify([
      { title: 'Entrenar', cadence: 'weekly', targetPerPeriod: 3, rationale: 'Mundial' },
      { title: 'Leer técnica', cadence: 'daily', targetPerPeriod: 1, rationale: 'foco' },
      { title: 'Extra', cadence: 'daily', targetPerPeriod: 1, rationale: 'x' },
    ])
    const r = parseHabitSuggestions(t)
    expect(r).toHaveLength(2)
    expect(r[0].cadence).toBe('weekly')
    expect(r[0].targetPerPeriod).toBe(3)
  })
  it('extrae el JSON aunque venga con texto alrededor', () => {
    const r = parseHabitSuggestions('Claro:\n[{"title":"Caminar","cadence":"daily","targetPerPeriod":1,"rationale":"salud"}]\nlisto')
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('Caminar')
  })
  it('daily fuerza target 1; clampa fuera de rango', () => {
    const r = parseHabitSuggestions(JSON.stringify([{ title: 'X', cadence: 'daily', targetPerPeriod: 9, rationale: '' }]))
    expect(r[0].targetPerPeriod).toBe(1)
  })
  it('texto inválido → []', () => {
    expect(parseHabitSuggestions('no json')).toEqual([])
  })
})
