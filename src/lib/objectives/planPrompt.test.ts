// SIR V2 — Tests del prompt/parser del plan OKR de objetivos.

import { describe, it, expect } from 'vitest'

import {
  buildPlanInput,
  parseObjectivePlan,
  parseFeasibilityNotes,
  extractJsonObject,
} from './planPrompt'

describe('buildPlanInput', () => {
  it('incluye título, dominio, descripción, hoy y fecha objetivo', () => {
    const msg = buildPlanInput({
      title: 'Competir en el Mundial en el exterior',
      description: 'Categoría sénior',
      category: 'personal',
      targetDate: '2026-11-01',
      today: '2026-06-01',
    })
    expect(msg).toContain('Competir en el Mundial en el exterior')
    expect(msg).toContain('Dominio: personal')
    expect(msg).toContain('Categoría sénior')
    expect(msg).toContain('Hoy es: 2026-06-01')
    expect(msg).toContain('Fecha objetivo: 2026-11-01')
    expect(msg).toContain('keyResults')
    // 0050: el cierre pide los campos Jira-light por tarea.
    expect(msg).toContain('acceptanceCriteria')
    expect(msg).toContain('effort')
    expect(msg).toContain('priority')
  })

  it('sin fecha objetivo → lo aclara', () => {
    const msg = buildPlanInput({ title: 'Aprender guitarra', today: '2026-06-01' })
    expect(msg).toContain('Sin fecha objetivo definida')
  })

  it('incluye SMART (target/baseline/why) y el bloque de grounding', () => {
    const msg = buildPlanInput({
      title: 'Competir afuera',
      target: 'Pesar 75 kg',
      baseline: '82 kg',
      why: 'Clasificar a mi categoría',
      context: 'DATOS REALES DEL USUARIO:\n- Finanzas (mes 2026-06): balance S/1500/mes.',
      today: '2026-06-01',
    })
    expect(msg).toContain('Meta medible (target): Pesar 75 kg')
    expect(msg).toContain('Punto de partida (hoy): 82 kg')
    expect(msg).toContain('Por qué importa: Clasificar a mi categoría')
    expect(msg).toContain('balance S/1500/mes')
  })

  it('sin grounding → no agrega bloque de datos', () => {
    const msg = buildPlanInput({ title: 'X', today: '2026-06-01' })
    expect(msg).not.toContain('DATOS REALES')
  })
})

describe('parseFeasibilityNotes', () => {
  it('extrae el array feasibility del JSON', () => {
    const raw = JSON.stringify({
      keyResults: [{ title: 'KR', tasks: [] }],
      feasibility: ['Te faltan ~S/2000 para el pasaje', 'Estás 7 kg sobre tu categoría'],
    })
    expect(parseFeasibilityNotes(raw)).toEqual([
      'Te faltan ~S/2000 para el pasaje',
      'Estás 7 kg sobre tu categoría',
    ])
  })

  it('descarta entradas vacías y no-string', () => {
    const raw = JSON.stringify({ feasibility: ['ok', '', '   ', 42, null, 'dos'] })
    expect(parseFeasibilityNotes(raw)).toEqual(['ok', 'dos'])
  })

  it('sin feasibility o no-array → []', () => {
    expect(parseFeasibilityNotes(JSON.stringify({ keyResults: [] }))).toEqual([])
    expect(parseFeasibilityNotes(JSON.stringify({ feasibility: 'no-array' }))).toEqual([])
    expect(parseFeasibilityNotes('no json')).toEqual([])
  })

  it('tolera markdown alrededor', () => {
    const raw = '```json\n{ "feasibility": ["nota"] }\n```'
    expect(parseFeasibilityNotes(raw)).toEqual(['nota'])
  })
})

describe('parseObjectivePlan', () => {
  it('parsea un plan OKR limpio (KRs con tareas)', () => {
    const raw = JSON.stringify({
      keyResults: [
        {
          title: 'Visa y viaje',
          tasks: [
            { title: 'Tramitar la eVisa', targetDate: '2026-07-01' },
            { title: 'Comprar el pasaje', description: 'ida y vuelta', targetDate: '2026-07-15' },
          ],
        },
        {
          title: 'Inscripción',
          tasks: [{ title: 'Pagar el fee' }],
        },
      ],
    })
    const krs = parseObjectivePlan(raw)
    expect(krs).toHaveLength(2)
    expect(krs[0].title).toBe('Visa y viaje')
    expect(krs[0].tasks).toHaveLength(2)
    expect(krs[0].tasks[0]).toEqual({
      title: 'Tramitar la eVisa',
      description: undefined,
      targetDate: '2026-07-01',
      acceptanceCriteria: undefined,
      effort: undefined,
      priority: undefined,
    })
    expect(krs[0].tasks[1].description).toBe('ida y vuelta')
    expect(krs[1].tasks[0]).toEqual({
      title: 'Pagar el fee',
      description: undefined,
      targetDate: undefined,
      acceptanceCriteria: undefined,
      effort: undefined,
      priority: undefined,
    })
  })

  it('parsea los campos Jira-light (acceptanceCriteria, effort, priority)', () => {
    const raw = JSON.stringify({
      keyResults: [
        {
          title: 'Visa y viaje',
          tasks: [
            {
              title: 'Tramitar la eVisa',
              acceptanceCriteria: 'eVisa aprobada y guardada en PDF',
              effort: 'M',
              priority: 'high',
              targetDate: '2026-07-01',
            },
          ],
        },
      ],
    })
    expect(parseObjectivePlan(raw)[0].tasks[0]).toEqual({
      title: 'Tramitar la eVisa',
      description: undefined,
      targetDate: '2026-07-01',
      acceptanceCriteria: 'eVisa aprobada y guardada en PDF',
      effort: 'M',
      priority: 'high',
    })
  })

  it('normaliza effort/priority case-insensitive y descarta valores inválidos', () => {
    const raw = JSON.stringify({
      keyResults: [
        {
          title: 'KR',
          tasks: [
            { title: 'A', effort: 'm', priority: 'HIGH' }, // case mix → normaliza
            { title: 'B', effort: 'XL', priority: 'urgent' }, // inválidos → undefined
          ],
        },
      ],
    })
    const tasks = parseObjectivePlan(raw)[0].tasks
    expect(tasks[0].effort).toBe('M')
    expect(tasks[0].priority).toBe('high')
    expect(tasks[1].effort).toBeUndefined()
    expect(tasks[1].priority).toBeUndefined()
  })

  it('tolera markdown/ruido alrededor del JSON', () => {
    const raw =
      'Claro, acá tenés el plan:\n```json\n{ "keyResults": [ { "title": "KR A", "tasks": [ { "title": "Hacer X" } ] } ] }\n```\n¡Éxitos!'
    const krs = parseObjectivePlan(raw)
    expect(krs).toHaveLength(1)
    expect(krs[0].title).toBe('KR A')
    expect(krs[0].tasks[0].title).toBe('Hacer X')
  })

  it('descarta KRs sin título; conserva KRs sin tareas', () => {
    const raw = JSON.stringify({
      keyResults: [
        { title: '', tasks: [{ title: 'X' }] },
        { title: '   ', tasks: [] },
        { title: 'Válido', tasks: [] },
        { foo: 1 },
      ],
    })
    const krs = parseObjectivePlan(raw)
    expect(krs).toHaveLength(1)
    expect(krs[0].title).toBe('Válido')
    expect(krs[0].tasks).toEqual([])
  })

  it('descarta tareas sin título dentro de un KR', () => {
    const raw = JSON.stringify({
      keyResults: [{ title: 'KR', tasks: [{ title: '' }, { title: 'Buena' }, { nope: 1 }] }],
    })
    const krs = parseObjectivePlan(raw)
    expect(krs[0].tasks).toHaveLength(1)
    expect(krs[0].tasks[0].title).toBe('Buena')
  })

  it('ignora targetDate con formato inválido', () => {
    const raw = JSON.stringify({ keyResults: [{ title: 'KR', tasks: [{ title: 'X', targetDate: '15 de julio' }] }] })
    expect(parseObjectivePlan(raw)[0].tasks[0].targetDate).toBeUndefined()
  })

  it('KR sin campo tasks → tasks vacío', () => {
    const raw = JSON.stringify({ keyResults: [{ title: 'Solo KR' }] })
    const krs = parseObjectivePlan(raw)
    expect(krs).toHaveLength(1)
    expect(krs[0].tasks).toEqual([])
  })

  it('JSON inválido o sin keyResults → []', () => {
    expect(parseObjectivePlan('no json aquí')).toEqual([])
    expect(parseObjectivePlan('{ "otra": 1 }')).toEqual([])
    expect(parseObjectivePlan('')).toEqual([])
    expect(parseObjectivePlan('{ "keyResults": "no es array" }')).toEqual([])
  })

  // ─── Robustez del extractor (regresión del 502 "plan vacío") ──────────
  it('tolera comas colgantes (trailing commas) que el modelo a veces deja', () => {
    const raw = '{ "keyResults": [ { "title": "A", "tasks": [ { "title": "x" }, ], }, ], }'
    const krs = parseObjectivePlan(raw)
    expect(krs).toHaveLength(1)
    expect(krs[0].tasks[0].title).toBe('x')
  })

  it('tolera prosa antes y después del objeto JSON', () => {
    const raw = 'Perfecto, este es tu plan: { "keyResults": [ { "title": "A", "tasks": [] } ] } ¡A por ello!'
    expect(parseObjectivePlan(raw)).toHaveLength(1)
  })

  it('no se confunde con llaves dentro de strings', () => {
    const raw = '{ "keyResults": [ { "title": "Fase {1}: arranque", "tasks": [] } ] }'
    expect(parseObjectivePlan(raw)[0].title).toBe('Fase {1}: arranque')
  })

  it('respuesta TRUNCADA (sin cerrar) → [] (gatilla el reintento server-side)', () => {
    // Caso raíz del 502: el modelo se pasa de max_tokens y la salida queda a
    // mitad de camino → JSON incompleto → no parseable → [].
    const raw = '{ "keyResults": [ { "title": "Subir ingresos", "tasks": [ { "title": "Cotiz'
    expect(parseObjectivePlan(raw)).toEqual([])
  })
})

describe('extractJsonObject', () => {
  it('extrae un objeto balanceado válido', () => {
    expect(extractJsonObject('{ "a": 1 }')).toEqual({ a: 1 })
  })
  it('truncado → null', () => {
    expect(extractJsonObject('{ "a": [ { "b": ')).toBeNull()
  })
  it('sin objeto → null', () => {
    expect(extractJsonObject('solo texto')).toBeNull()
    expect(extractJsonObject('')).toBeNull()
  })
  it('un array top-level no cuenta como objeto → null', () => {
    expect(extractJsonObject('[1,2,3]')).toBeNull()
  })
})
