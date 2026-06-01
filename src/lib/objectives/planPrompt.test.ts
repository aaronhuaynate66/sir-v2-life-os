// SIR V2 — Tests del prompt/parser del plan de objetivos.

import { describe, it, expect } from 'vitest'

import { buildPlanInput, parseObjectivePlan } from './planPrompt'

describe('buildPlanInput', () => {
  it('incluye título, dominio, descripción, hoy y fecha objetivo', () => {
    const msg = buildPlanInput({
      title: 'Ganar el Mundial de Bomberos',
      description: 'Categoría sénior',
      category: 'personal',
      targetDate: '2026-11-01',
      today: '2026-06-01',
    })
    expect(msg).toContain('Ganar el Mundial de Bomberos')
    expect(msg).toContain('Dominio: personal')
    expect(msg).toContain('Categoría sénior')
    expect(msg).toContain('Hoy es: 2026-06-01')
    expect(msg).toContain('Fecha objetivo: 2026-11-01')
  })

  it('sin fecha objetivo → lo aclara', () => {
    const msg = buildPlanInput({ title: 'Aprender guitarra', today: '2026-06-01' })
    expect(msg).toContain('Sin fecha objetivo definida')
  })
})

describe('parseObjectivePlan', () => {
  it('parsea JSON limpio', () => {
    const raw = JSON.stringify({
      steps: [
        { title: 'Inscribirse al equipo', targetDate: '2026-06-15' },
        { title: 'Plan de entrenamiento', description: '5 días/semana', targetDate: '2026-07-01' },
      ],
    })
    const steps = parseObjectivePlan(raw)
    expect(steps).toHaveLength(2)
    expect(steps[0]).toEqual({ title: 'Inscribirse al equipo', description: undefined, targetDate: '2026-06-15' })
    expect(steps[1].description).toBe('5 días/semana')
  })

  it('tolera markdown/ruido alrededor del JSON', () => {
    const raw = 'Claro, acá tenés el plan:\n```json\n{ "steps": [ { "title": "Paso A" } ] }\n```\n¡Éxitos!'
    const steps = parseObjectivePlan(raw)
    expect(steps).toHaveLength(1)
    expect(steps[0].title).toBe('Paso A')
  })

  it('descarta pasos sin título', () => {
    const raw = JSON.stringify({ steps: [{ title: '' }, { title: '   ' }, { title: 'Válido' }, { foo: 1 }] })
    const steps = parseObjectivePlan(raw)
    expect(steps).toHaveLength(1)
    expect(steps[0].title).toBe('Válido')
  })

  it('ignora targetDate con formato inválido', () => {
    const raw = JSON.stringify({ steps: [{ title: 'X', targetDate: '15 de junio' }] })
    expect(parseObjectivePlan(raw)[0].targetDate).toBeUndefined()
  })

  it('JSON inválido o sin steps → []', () => {
    expect(parseObjectivePlan('no json aquí')).toEqual([])
    expect(parseObjectivePlan('{ "otra": 1 }')).toEqual([])
    expect(parseObjectivePlan('')).toEqual([])
    expect(parseObjectivePlan('{ "steps": "no es array" }')).toEqual([])
  })
})
