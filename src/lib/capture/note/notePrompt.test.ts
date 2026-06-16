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


describe('parseNoteExtract — specialDates (Fechas importantes)', () => {
  it('extrae specialDates con fecha ISO + recurring', () => {
    const r = parseNoteExtract('{"birthDate":null,"location":null,"summary":"Le festejaron el cumple y se casó.","facts":[],"specialDates":[{"label":"Cumpleaños","date":"2026-06-16","recurring":true},{"label":"Aniversario de boda","date":"2026-06-13","recurring":true}]}')
    expect(r?.specialDates).toHaveLength(2)
    expect(r?.specialDates[0]).toEqual({ label: 'Cumpleaños', date: '2026-06-16', recurring: true })
  })
  it('descarta fechas sin ISO válido', () => {
    const r = parseNoteExtract('{"summary":"x","facts":[],"specialDates":[{"label":"Casamiento","date":"sábado pasado","recurring":true}]}')
    expect(r?.specialDates).toHaveLength(0)
  })
  it('una nota con SOLO specialDates ya no es null', () => {
    const r = parseNoteExtract('{"birthDate":null,"location":null,"summary":"","facts":[],"specialDates":[{"label":"Mudanza","date":"2026-06-01","recurring":false}]}')
    expect(r?.specialDates).toHaveLength(1)
  })
  it('buildNoteInput incluye "Hoy es" cuando se pasa la fecha', () => {
    expect(buildNoteInput('se casó el sábado pasado', '2026-06-16')).toContain('Hoy es 2026-06-16')
  })
})
