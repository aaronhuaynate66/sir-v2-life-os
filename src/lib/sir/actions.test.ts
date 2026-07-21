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
  it('crear_persona: valida enums con defaults y exige nombre', () => {
    const a = parseProposedAction('proponer_crear_persona', { nombre: 'Emilio', relacion: 'friend', categoria: 'close' })
    expect(a).toEqual({ kind: 'crear_persona', nombre: 'Emilio', relacion: 'friend', categoria: 'close' })
    const b = parseProposedAction('proponer_crear_persona', { nombre: 'X', relacion: 'zzz', categoria: 'qqq' })
    expect(b).toMatchObject({ relacion: 'acquaintance', categoria: 'network' })
    expect(parseProposedAction('proponer_crear_persona', { relacion: 'friend' })).toBeNull()
  })

  it('marcar_habito: exige el nombre del hábito', () => {
    expect(parseProposedAction('proponer_marcar_habito', { habito: 'meditar' })).toEqual({ kind: 'marcar_habito', habito: 'meditar' })
    expect(parseProposedAction('proponer_marcar_habito', {})).toBeNull()
    expect(parseProposedAction('proponer_marcar_habito', { habito: '  ' })).toBeNull()
  })

  it('marcar_tarea: exige el nombre de la tarea', () => {
    expect(parseProposedAction('proponer_marcar_tarea', { tarea: 'sacar la visa' })).toEqual({ kind: 'marcar_tarea', tarea: 'sacar la visa' })
    expect(parseProposedAction('proponer_marcar_tarea', {})).toBeNull()
    expect(parseProposedAction('proponer_marcar_tarea', { tarea: '  ' })).toBeNull()
  })

  it('crear_plan: exige título y fecha ISO', () => {
    expect(parseProposedAction('proponer_crear_plan', { titulo: 'Ver depa', fecha: '2026-07-19', persona: 'Diana', nota: '14:00' }))
      .toEqual({ kind: 'crear_plan', titulo: 'Ver depa', fecha: '2026-07-19', persona: 'Diana', nota: '14:00' })
    // fecha no-ISO → se descarta (queda '') para que el flujo pida aclararla
    expect(parseProposedAction('proponer_crear_plan', { titulo: 'Ver depa', fecha: 'el sábado' }))
      .toMatchObject({ kind: 'crear_plan', fecha: '', persona: null })
    // sin título → null
    expect(parseProposedAction('proponer_crear_plan', { fecha: '2026-07-19' })).toBeNull()
  })

  it('crear_recordatorio: exige texto y normaliza `cuando` a ISO', () => {
    const r = parseProposedAction('proponer_crear_recordatorio', { texto: 'pedir pastillas', cuando: '2026-07-22T09:00:00-05:00' })
    expect(r).toMatchObject({ kind: 'crear_recordatorio', texto: 'pedir pastillas' })
    expect((r as { cuando: string }).cuando).toBe('2026-07-22T14:00:00.000Z') // -05:00 → UTC
    // cuando inválido → queda '' (el flujo pide aclarar)
    expect(parseProposedAction('proponer_crear_recordatorio', { texto: 'algo', cuando: 'mañana' }))
      .toMatchObject({ kind: 'crear_recordatorio', cuando: '' })
    // sin texto → null
    expect(parseProposedAction('proponer_crear_recordatorio', { cuando: '2026-07-22T09:00:00-05:00' })).toBeNull()
  })

  it('toolName desconocido → null', () => {
    expect(parseProposedAction('otra_cosa', {})).toBeNull()
  })
})
