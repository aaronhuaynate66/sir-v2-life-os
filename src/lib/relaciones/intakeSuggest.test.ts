import { describe, it, expect } from 'vitest'
import { parseIntakeSuggestion, buildIntakeInput } from './intakeSuggest'

describe('parseIntakeSuggestion', () => {
  it('parsea y valida enums', () => {
    const r = parseIntakeSuggestion('{"name":"Miluska Castillo Romero","organization":"Hikvision","relationship":"professional","category":"network","reason":"LinkedIn marketing en Hikvision."}')
    expect(r).not.toBeNull()
    expect(r!.name).toBe('Miluska Castillo Romero')
    expect(r!.organization).toBe('Hikvision')
    expect(r!.relationship).toBe('professional')
    expect(r!.category).toBe('network')
  })

  it('cae a defaults cuando el enum es inválido', () => {
    const r = parseIntakeSuggestion('{"name":"Ana","relationship":"colega","category":"vip","reason":""}')
    expect(r!.relationship).toBe('professional')
    expect(r!.category).toBe('network')
  })

  it('tolera fences y texto alrededor', () => {
    const r = parseIntakeSuggestion('```json\n{"name":"Beto","relationship":"friend","category":"close"}\n```')
    expect(r!.name).toBe('Beto')
    expect(r!.relationship).toBe('friend')
  })

  it('devuelve null sin nombre', () => {
    expect(parseIntakeSuggestion('{"name":"","relationship":"friend"}')).toBeNull()
    expect(parseIntakeSuggestion('basura')).toBeNull()
  })
})

describe('buildIntakeInput', () => {
  it('incluye las señales presentes', () => {
    const s = buildIntakeInput({
      linkedin: { fullName: 'Miluska Castillo', company: 'Hikvision' },
      whatsapp: { name: 'Miluska Castillo Hv', participants: ['Aaron', 'Miluska'] },
    })
    expect(s).toContain('Hikvision')
    expect(s).toContain('Miluska')
    expect(s).toContain('LinkedIn')
    expect(s).toContain('WhatsApp')
  })
})
