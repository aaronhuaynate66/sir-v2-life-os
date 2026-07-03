import { describe, it, expect } from 'vitest'
import { detectMentionedPersons, extractTags } from './mentions'

const PEOPLE = [
  { id: 'p1', name: 'Diana Díaz' },
  { id: 'p2', name: 'Diana Cencaro' },
  { id: 'p3', name: 'Fabiola Masías Ponce' },
  { id: 'p4', name: 'Adrián López' },
]

describe('detectMentionedPersons', () => {
  it('nombre completo matchea', () => {
    expect(detectMentionedPersons('hoy vi a Diana Díaz', PEOPLE).sort()).toEqual(['p1'])
  })

  it('primer nombre único (Adrián) matchea', () => {
    expect(detectMentionedPersons('hablé con Adrián', PEOPLE).sort()).toEqual(['p4'])
  })

  it('primer nombre AMBIGUO (Diana) NO matchea', () => {
    expect(detectMentionedPersons('extrañé a Diana', PEOPLE).sort()).toEqual([])
  })

  it('múltiples menciones', () => {
    expect(detectMentionedPersons('llamé a Adrián y a Fabiola Masías Ponce', PEOPLE).sort()).toEqual(['p3', 'p4'])
  })

  it('sin mención → []', () => {
    expect(detectMentionedPersons('hoy fui a correr', PEOPLE)).toEqual([])
  })

  it('case/accent insensitive', () => {
    expect(detectMentionedPersons('vi a DIANA DIAZ', PEOPLE).sort()).toEqual(['p1'])
  })

  it('primer nombre corto (2 chars) NO matchea', () => {
    const p = [{ id: 'x', name: 'Al Pacino' }]
    expect(detectMentionedPersons('cambio de plan al mediodía', p)).toEqual([])
  })
})

describe('extractTags', () => {
  it('extrae hashtags', () => {
    expect(extractTags('hoy me sentí bien #reflexión #trabajo').sort()).toEqual(['reflexión', 'trabajo'])
  })
  it('acepta números y guiones', () => {
    expect(extractTags('#semana-1 #idea-42').sort()).toEqual(['idea-42', 'semana-1'])
  })
  it('ignora # sueltos', () => {
    expect(extractTags('un solo # no cuenta')).toEqual([])
  })
  it('sin duplicados', () => {
    expect(extractTags('#lunes #lunes #martes').sort()).toEqual(['lunes', 'martes'])
  })
})
