import { describe, it, expect } from 'vitest'
import { parseGoalSuggestion } from './goalSuggest'

describe('parseGoalSuggestion', () => {
  it('parsea el caso RIT: prioridad alta, fecha null (gatillado por evento), persona', () => {
    const raw = JSON.stringify({
      title: 'Ingresar al RIT (CGBVP)',
      description: 'Incorporarme al RIT del CGBVP cuando abra el próximo curso. Aviso depende de Guillermo.',
      category: 'career', priority: 'high', peaceImpact: 7,
      nextAction: 'Sostener plan de entrenamiento físico',
      targetDate: null, relatedPersonNames: ['Guillermo Cornejo'],
      reasoning: 'Alta no crítica: no hay deadline y el timing no lo controlás. [Suposición] impacto 7.',
    })
    const g = parseGoalSuggestion(raw)!
    expect(g.title).toBe('Ingresar al RIT (CGBVP)')
    expect(g.category).toBe('career')
    expect(g.priority).toBe('high')
    expect(g.targetDate).toBeNull()
    expect(g.relatedPersonNames).toEqual(['Guillermo Cornejo'])
  })
  it('enums inválidos caen a default (personal/high), peaceImpact se clampa', () => {
    const g = parseGoalSuggestion(JSON.stringify({ title: 'Meta', category: 'xx', priority: 'zz', peaceImpact: 99 }))!
    expect(g.category).toBe('personal')
    expect(g.priority).toBe('high')
    expect(g.peaceImpact).toBe(10)
  })
  it('NO inventa fecha: string basura → null', () => {
    expect(parseGoalSuggestion(JSON.stringify({ title: 'Meta', targetDate: 'pronto' }))!.targetDate).toBeNull()
  })
  it('sin título → null', () => {
    expect(parseGoalSuggestion(JSON.stringify({ description: 'algo' }))).toBeNull()
    expect(parseGoalSuggestion('no json')).toBeNull()
  })
})
