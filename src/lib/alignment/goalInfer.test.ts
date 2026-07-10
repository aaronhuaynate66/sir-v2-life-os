// SIR V2 — Tests de la inferencia de vínculo de objetivos sueltos (Etapa 4).
// Lógica pura: input builder + parse con el guardrail duro anti-invención
// (filtro a la lista de contactos reales).

import { describe, it, expect } from 'vitest'

import {
  buildGoalInferInput,
  parseGoalInference,
  type GoalLinkInference,
} from './goalInfer'

describe('buildGoalInferInput', () => {
  it('incluye el objetivo y la lista de candidatos', () => {
    const out = buildGoalInferInput(
      { title: 'Cerrar Boticas Jhodaal', description: 'propuesta comercial', why: 'plata para la mudanza' },
      ['Dayana', 'Diana Díaz'],
    )
    expect(out).toContain('Cerrar Boticas Jhodaal')
    expect(out).toContain('propuesta comercial')
    expect(out).toContain('plata para la mudanza')
    expect(out).toContain('- Dayana')
    expect(out).toContain('- Diana Díaz')
  })

  it('sin candidatos → instruye devolver vacío', () => {
    const out = buildGoalInferInput({ title: 'Meditar más' }, [])
    expect(out).toContain('no tiene contactos')
  })
})

describe('parseGoalInference — guardrail anti-invención', () => {
  const allowed = ['Dayana', 'Diana Díaz', 'Guillermo']

  it('conserva SOLO los nombres que están en la lista real (case/acento-insensible → canónico)', () => {
    const raw = '{"personNames": ["dayana", "DIANA DIAZ"], "category": "financial", "reasoning": "menciona el deal", "confident": true}'
    const inf = parseGoalInference(raw, allowed) as GoalLinkInference
    expect(inf.personNames).toEqual(['Dayana', 'Diana Díaz']) // canónicos, no lo que dijo el modelo
    expect(inf.category).toBe('financial')
    expect(inf.confident).toBe(true)
  })

  it('DESCARTA un nombre alucinado que no está en la lista', () => {
    const raw = '{"personNames": ["Fulano Inexistente", "Guillermo"], "category": "career", "reasoning": "x", "confident": true}'
    const inf = parseGoalInference(raw, allowed) as GoalLinkInference
    expect(inf.personNames).toEqual(['Guillermo'])
  })

  it('deduplica nombres que colapsan al mismo canónico', () => {
    const raw = '{"personNames": ["dayana", "Dayana", "DAYANA"], "category": null, "reasoning": "", "confident": true}'
    const inf = parseGoalInference(raw, allowed) as GoalLinkInference
    expect(inf.personNames).toEqual(['Dayana'])
  })

  it('personNames vacío + category null → confident=false aunque el modelo diga true', () => {
    const raw = '{"personNames": [], "category": null, "reasoning": "no está claro", "confident": true}'
    const inf = parseGoalInference(raw, allowed) as GoalLinkInference
    expect(inf.personNames).toEqual([])
    expect(inf.category).toBeNull()
    expect(inf.confident).toBe(false) // no forzamos vínculo sin nada
  })

  it('category inválida → null', () => {
    const raw = '{"personNames": [], "category": "inventada", "reasoning": "", "confident": false}'
    const inf = parseGoalInference(raw, allowed) as GoalLinkInference
    expect(inf.category).toBeNull()
  })

  it('respeta confident=false del modelo aun con dominio sugerido', () => {
    const raw = '{"personNames": [], "category": "health", "reasoning": "quizás", "confident": false}'
    const inf = parseGoalInference(raw, allowed) as GoalLinkInference
    expect(inf.confident).toBe(false)
    expect(inf.category).toBe('health') // el dominio se ofrece igual, pero sin confianza
  })

  it('sin JSON usable → null', () => {
    expect(parseGoalInference('no hay json acá', allowed)).toBeNull()
    expect(parseGoalInference('', allowed)).toBeNull()
  })

  it('JSON roto → null', () => {
    expect(parseGoalInference('{"personNames": [', allowed)).toBeNull()
  })

  it('personNames no-array → vacío (no rompe)', () => {
    const raw = '{"personNames": "Dayana", "category": "financial", "reasoning": "", "confident": true}'
    const inf = parseGoalInference(raw, allowed) as GoalLinkInference
    expect(inf.personNames).toEqual([])
    expect(inf.confident).toBe(true) // hay category
  })
})
