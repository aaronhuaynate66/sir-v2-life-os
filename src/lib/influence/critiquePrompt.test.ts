import { describe, it, expect } from 'vitest'
import { buildCritiqueInput, parseCritique } from './critiquePrompt'

describe('buildCritiqueInput', () => {
  it('arma el acercamiento a revisar', () => {
    const s = buildCritiqueInput({ personName: 'Diana', objective: 'que acepte mudarse', read: 'está dudosa', opener: 'oye…', actions: ['reconocer su miedo', ''] })
    expect(s).toContain('Persona: Diana')
    expect(s).toContain('Cómo abrir: oye…')
    expect(s).toContain('- reconocer su miedo')
  })
})

describe('parseCritique', () => {
  it('parsea tono/nota/mejora', () => {
    const c = parseCritique('{"tone":"presiona","note":"empujas de más","betterMove":"pregunta primero cómo se siente"}')
    expect(c).toEqual({ tone: 'presiona', note: 'empujas de más', betterMove: 'pregunta primero cómo se siente' })
  })
  it('tono raro → sano por defecto', () => {
    expect(parseCritique('{"tone":"???","note":"ok"}')?.tone).toBe('sano')
  })
  it('JSON inválido o vacío → null', () => {
    expect(parseCritique('nope')).toBeNull()
    expect(parseCritique('{"tone":"sano"}')).toBeNull()
  })
})
