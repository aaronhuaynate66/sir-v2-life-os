import { describe, it, expect } from 'vitest'
import { parseProposedAction } from './actions'

describe('parseProposedAction', () => {
  it('registrar_interaccion: clampea calidad y exige persona', () => {
    const a = parseProposedAction('proponer_registrar_interaccion', { persona: 'Dayana', calidad: 9, nota: 'me saludó' })
    expect(a).toEqual({ kind: 'registrar_interaccion', persona: 'Dayana', calidad: 5, nota: 'me saludó' })
    expect(parseProposedAction('proponer_registrar_interaccion', { calidad: 4 })).toBeNull()
  })
  it('crear_objetivo: valida enums con defaults y exige título', () => {
    const a = parseProposedAction('proponer_crear_objetivo', { titulo: 'Entrenar', categoria: 'xxx', prioridad: 'zzz', impacto_paz: 99 })
    expect(a).toMatchObject({ kind: 'crear_objetivo', titulo: 'Entrenar', categoria: 'personal', prioridad: 'high', impactoPaz: 10 })
    expect(parseProposedAction('proponer_crear_objetivo', { categoria: 'health' })).toBeNull()
  })
  it('crear_objetivo: respeta enums válidos + persona', () => {
    const a = parseProposedAction('proponer_crear_objetivo', { titulo: 'RIT', categoria: 'career', prioridad: 'critical', persona_relacionada: 'Cornejo' })
    expect(a).toMatchObject({ categoria: 'career', prioridad: 'critical', personaRelacionada: 'Cornejo' })
  })
  it('toolName desconocido → null', () => {
    expect(parseProposedAction('otra_cosa', {})).toBeNull()
  })
})
