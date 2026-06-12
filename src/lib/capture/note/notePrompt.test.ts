import { describe, it, expect } from 'vitest'
import { parseNoteExtract, buildNoteInput } from './notePrompt'

describe('parseNoteExtract', () => {
  it('extrae birthDate, summary y facts de un JSON válido', () => {
    const r = parseNoteExtract('{"birthDate":"1993-06-20","location":null,"summary":"Te contó que cumple el 20 de junio.","facts":["Cumpleaños: 20 de junio","Nació en 1993"]}')
    expect(r?.birthDate).toBe('1993-06-20')
    expect(r?.facts).toHaveLength(2)
    expect(r?.summary).toContain('20 de junio')
  })
  it('descarta birthDate con formato inválido (lo deja null)', () => {
    const r = parseNoteExtract('{"birthDate":"20 de junio","summary":"x","facts":[]}')
    expect(r?.birthDate).toBeNull()
  })
  it('devuelve null si no hay nada útil', () => {
    expect(parseNoteExtract('{"birthDate":null,"location":null,"summary":"","facts":[]}')).toBeNull()
    expect(parseNoteExtract('no json')).toBeNull()
  })
  it('buildNoteInput incluye el texto y la regla de solo-lo-que-dice', () => {
    const m = buildNoteInput('Cumple el 20 de junio')
    expect(m).toContain('Cumple el 20 de junio')
    expect(m.toLowerCase()).toContain('solo lo que dice la nota')
  })
})
