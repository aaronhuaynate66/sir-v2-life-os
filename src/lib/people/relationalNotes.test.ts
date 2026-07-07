import { describe, it, expect } from 'vitest'
import {
  parseRelationalNotes,
  normalizeNoteItem,
  addNote,
  removeNote,
  hasAnyRelationalNote,
  EMPTY_RELATIONAL_NOTES,
  MAX_NOTES_PER_KIND,
  MAX_NOTE_LENGTH,
  RELATIONAL_NOTE_KINDS,
} from './relationalNotes'

describe('normalizeNoteItem', () => {
  it('colapsa espacios y recorta', () => {
    expect(normalizeNoteItem('  hola   mundo  ')).toBe('hola mundo')
  })
  it('vacío para solo-espacios', () => {
    expect(normalizeNoteItem('   ')).toBe('')
  })
  it('capa al máximo de longitud', () => {
    const long = 'a'.repeat(MAX_NOTE_LENGTH + 50)
    expect(normalizeNoteItem(long).length).toBe(MAX_NOTE_LENGTH)
  })
})

describe('parseRelationalNotes', () => {
  it('null/undefined/basura → vacío', () => {
    expect(parseRelationalNotes(null)).toEqual(EMPTY_RELATIONAL_NOTES)
    expect(parseRelationalNotes(undefined)).toEqual(EMPTY_RELATIONAL_NOTES)
    expect(parseRelationalNotes('nope')).toEqual(EMPTY_RELATIONAL_NOTES)
    expect(parseRelationalNotes([1, 2])).toEqual(EMPTY_RELATIONAL_NOTES)
  })
  it('objeto parcial se completa', () => {
    expect(parseRelationalNotes({ tensions: ['a'] })).toEqual({
      tensions: ['a'],
      strengths: [],
      sharedGoals: [],
    })
  })
  it('filtra no-strings, normaliza y dedupea case-insensitive', () => {
    const r = parseRelationalNotes({
      tensions: ['  Roce  ', 'roce', 42, null, 'Otro'],
    })
    expect(r.tensions).toEqual(['Roce', 'Otro'])
  })
  it('capa al máximo por lista', () => {
    const many = Array.from({ length: MAX_NOTES_PER_KIND + 5 }, (_, i) => `item ${i}`)
    expect(parseRelationalNotes({ strengths: many }).strengths.length).toBe(MAX_NOTES_PER_KIND)
  })
  it('es idempotente (re-parsear no cambia)', () => {
    const once = parseRelationalNotes({ tensions: [' a ', 'A', 'b'] })
    expect(parseRelationalNotes(once)).toEqual(once)
  })
  it('no muta la entrada', () => {
    const input = { tensions: ['a'] }
    parseRelationalNotes(input)
    expect(input).toEqual({ tensions: ['a'] })
  })
})

describe('addNote', () => {
  it('agrega normalizado', () => {
    const r = addNote(EMPTY_RELATIONAL_NOTES, 'tensions', '  celos  ')
    expect(r.tensions).toEqual(['celos'])
  })
  it('no muta la entrada (inmutable)', () => {
    const base = { ...EMPTY_RELATIONAL_NOTES }
    const r = addNote(base, 'strengths', 'leal')
    expect(base.strengths).toEqual([])
    expect(r.strengths).toEqual(['leal'])
  })
  it('no-op para item vacío', () => {
    const base = EMPTY_RELATIONAL_NOTES
    expect(addNote(base, 'tensions', '   ')).toBe(base)
  })
  it('no-op para duplicado case-insensitive', () => {
    const base = addNote(EMPTY_RELATIONAL_NOTES, 'tensions', 'Celos')
    expect(addNote(base, 'tensions', 'celos')).toBe(base)
  })
  it('no-op al llegar al cap', () => {
    let notes = EMPTY_RELATIONAL_NOTES
    for (let i = 0; i < MAX_NOTES_PER_KIND; i++) notes = addNote(notes, 'sharedGoals', `g${i}`)
    const capped = addNote(notes, 'sharedGoals', 'uno más')
    expect(capped).toBe(notes)
    expect(capped.sharedGoals.length).toBe(MAX_NOTES_PER_KIND)
  })
  it('no toca las otras listas', () => {
    const r = addNote(EMPTY_RELATIONAL_NOTES, 'tensions', 'x')
    expect(r.strengths).toEqual([])
    expect(r.sharedGoals).toEqual([])
  })
})

describe('removeNote', () => {
  it('quita por índice (inmutable)', () => {
    const base = parseRelationalNotes({ strengths: ['a', 'b', 'c'] })
    const r = removeNote(base, 'strengths', 1)
    expect(r.strengths).toEqual(['a', 'c'])
    expect(base.strengths).toEqual(['a', 'b', 'c'])
  })
  it('no-op para índice fuera de rango', () => {
    const base = parseRelationalNotes({ strengths: ['a'] })
    expect(removeNote(base, 'strengths', 5)).toBe(base)
    expect(removeNote(base, 'strengths', -1)).toBe(base)
  })
})

describe('hasAnyRelationalNote', () => {
  it('false para vacío/null', () => {
    expect(hasAnyRelationalNote(EMPTY_RELATIONAL_NOTES)).toBe(false)
    expect(hasAnyRelationalNote(null)).toBe(false)
    expect(hasAnyRelationalNote(undefined)).toBe(false)
  })
  it('true si alguna lista tiene items', () => {
    expect(hasAnyRelationalNote(parseRelationalNotes({ sharedGoals: ['x'] }))).toBe(true)
  })
})

describe('RELATIONAL_NOTE_KINDS', () => {
  it('cubre las tres listas exactamente una vez', () => {
    const kinds = RELATIONAL_NOTE_KINDS.map((k) => k.kind)
    expect(new Set(kinds)).toEqual(new Set(['tensions', 'strengths', 'sharedGoals']))
    expect(kinds.length).toBe(3)
  })
})
