import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { executeProposedAction, isExecutableByChat } from './executeAction'
import type { ProposedActionResolved } from './askSir'

// Mock de Supabase que ramifica por tabla y captura lo escrito.
function mockSb(opts: {
  person?: { id: string; name: string; notes?: string | null; relationship?: string } | null
  slugs?: string[]
  existingRel?: { id: string } | null
  linkedGoals?: Array<{ id: string }>
  relInsertError?: unknown
  goal?: { id: string; title: string; milestones?: unknown } | null
} = {}) {
  const person = opts.person === undefined ? { id: 'p1', name: 'Pablo', notes: null, relationship: 'friend' } : opts.person
  const slugs = opts.slugs ?? []
  const existingRel = opts.existingRel ?? null
  const linkedGoals = opts.linkedGoals ?? []
  const relInsertError = opts.relInsertError ?? null
  const goal = opts.goal ?? null
  const calls: Record<string, unknown> = {}
  const thenable = (result: unknown) => ({ then: (res: (v: unknown) => void) => res(result) })

  const sb = {
    from(table: string) {
      if (table === 'people') {
        const chain: Record<string, unknown> = {
          select: () => chain, eq: () => chain,
          maybeSingle: async () => ({ data: person }),
          then: (res: (v: unknown) => void) => res({ data: slugs.map((s) => ({ slug: s })), error: null }),
          insert: (row: Record<string, unknown>) => { calls.peopleInsert = row; return thenable({ error: null }) },
          update: (row: Record<string, unknown>) => { calls.peopleUpdate = row; return chain },
        }
        return chain
      }
      if (table === 'person_logs') {
        return {
          insert: (row: Record<string, unknown>) => {
            calls.logInsert = row
            return { select: () => ({ single: async () => ({ data: { id: 'log1', logged_at: null, created_at: '2026-07-12T00:00:00Z' } }) }) }
          },
        }
      }
      if (table === 'memories') {
        return { upsert: (rows: unknown[]) => { calls.memUpsert = rows; return Promise.resolve({ error: null }) } }
      }
      if (table === 'person_cycles') {
        return { insert: (row: Record<string, unknown>) => { calls.cycleInsert = row; return thenable({ error: null }) } }
      }
      if (table === 'goals') {
        const chain: Record<string, unknown> = {
          select: () => chain, eq: () => chain, contains: () => chain,
          maybeSingle: async () => ({ data: goal }),
          then: (res: (v: unknown) => void) => res({ data: linkedGoals, error: null }),
          insert: (row: Record<string, unknown>) => { calls.goalInsert = row; return thenable({ error: null }) },
          update: (row: Record<string, unknown>) => {
            calls.goalUpdate = row
            return { in: () => thenable({ error: null }), eq: () => ({ eq: () => thenable({ error: null }) }) }
          },
        }
        return chain
      }
      if (table === 'relationships') {
        const chain: Record<string, unknown> = {
          select: () => chain, eq: () => chain, limit: () => chain,
          maybeSingle: async () => ({ data: existingRel }),
          insert: (row: Record<string, unknown>) => { calls.relInsert = row; return thenable({ error: relInsertError }) },
          update: (row: Record<string, unknown>) => { calls.relUpdate = row; return { eq: () => thenable({ error: null }) } },
        }
        return chain
      }
      return {}
    },
  } as unknown as SupabaseClient
  return { sb, calls }
}

const interaccion: ProposedActionResolved = {
  kind: 'registrar_interaccion', persona: 'Pablo', calidad: 5, nota: 'quiere avanzar con la campaña', personId: 'p1',
}

describe('executeProposedAction — registrar_interaccion', () => {
  it('inserta el person_log con el tono y la nota, y materializa la memoria', async () => {
    const { sb, calls } = mockSb()
    const r = await executeProposedAction(sb, 'u1', interaccion)
    expect(r.ok).toBe(true)
    expect(r.message).toContain('Pablo')
    expect(r.message).toContain('5/5')
    expect(calls.logInsert).toMatchObject({ user_id: 'u1', person_id: 'p1', kind: 'interaction', value: 5, note: 'quiere avanzar con la campaña' })
    expect(calls.memUpsert).toHaveLength(1)
  })

  it('falla claro sin personId resuelto', async () => {
    const { sb, calls } = mockSb()
    const r = await executeProposedAction(sb, 'u1', { ...interaccion, personId: null })
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/no encontré/i)
    expect(calls.logInsert).toBeUndefined()
  })

  it('falla si la persona no existe / es ajena', async () => {
    const { sb } = mockSb({ person: null })
    const r = await executeProposedAction(sb, 'u1', interaccion)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/no encontré/i)
  })

  it('NO materializa memoria si no hay nota', async () => {
    const { sb, calls } = mockSb()
    const r = await executeProposedAction(sb, 'u1', { ...interaccion, nota: '' })
    expect(r.ok).toBe(true)
    expect(calls.logInsert).toMatchObject({ note: null })
    expect(calls.memUpsert).toBeUndefined()
  })

  it('clampa el tono fuera de rango a 1..5', async () => {
    const { sb, calls } = mockSb()
    await executeProposedAction(sb, 'u1', { ...interaccion, calidad: 9 })
    expect((calls.logInsert as { value: number }).value).toBe(5)
  })
})

describe('executeProposedAction — crear_objetivo', () => {
  const goal: ProposedActionResolved = {
    kind: 'crear_objetivo', titulo: 'Cerrar el trato con Marlab', categoria: 'career', prioridad: 'high',
    proximoPaso: 'Llamar el lunes', impactoPaz: 8, personaRelacionada: 'Pablo', personId: 'p1',
  }
  it('inserta el goal con status active y liga la persona resuelta', async () => {
    const { sb, calls } = mockSb()
    const r = await executeProposedAction(sb, 'u1', goal)
    expect(r.ok).toBe(true)
    expect(r.message).toContain('Cerrar el trato con Marlab')
    expect(calls.goalInsert).toMatchObject({
      user_id: 'u1', title: 'Cerrar el trato con Marlab', category: 'career', priority: 'high',
      status: 'active', peace_impact: 8, next_action: 'Llamar el lunes', related_persons: ['p1'],
    })
    expect(String((calls.goalInsert as { id: string }).id)).toMatch(/^g_/)
  })
  it('falla si el título es vacío', async () => {
    const { sb, calls } = mockSb()
    const r = await executeProposedAction(sb, 'u1', { ...goal, titulo: '' })
    expect(r.ok).toBe(false)
    expect(calls.goalInsert).toBeUndefined()
  })
})

describe('executeProposedAction — crear_persona', () => {
  const persona: ProposedActionResolved = {
    kind: 'crear_persona', nombre: 'Piero Gadea', relacion: 'professional', categoria: 'network',
  } as ProposedActionResolved
  it('inserta la persona con id text, slug y columnas NOT NULL', async () => {
    const { sb, calls } = mockSb()
    const r = await executeProposedAction(sb, 'u1', persona)
    expect(r.ok).toBe(true)
    expect(r.message).toContain('Piero Gadea')
    expect(calls.peopleInsert).toMatchObject({
      user_id: 'u1', name: 'Piero Gadea', relationship: 'professional', category: 'network',
      importance_score: 5, trust_level: 5, energy_impact: 'neutral',
    })
    expect(String((calls.peopleInsert as { id: string }).id)).toMatch(/^per_/)
    expect((calls.peopleInsert as { slug: string }).slug.length).toBeGreaterThan(0)
  })
  it('desambigua el slug si ya existe', async () => {
    const { sb, calls } = mockSb({ slugs: ['piero-gadea'] })
    await executeProposedAction(sb, 'u1', persona)
    expect((calls.peopleInsert as { slug: string }).slug).not.toBe('piero-gadea')
  })
  it('falla si el nombre es muy corto', async () => {
    const { sb, calls } = mockSb()
    const r = await executeProposedAction(sb, 'u1', { ...persona, nombre: 'X' } as ProposedActionResolved)
    expect(r.ok).toBe(false)
    expect(calls.peopleInsert).toBeUndefined()
  })
})

describe('executeProposedAction — cerrar_relacion', () => {
  const cierre: ProposedActionResolved = { kind: 'cerrar_relacion', persona: 'Ana', motivo: 'se terminó', personId: 'p1' } as ProposedActionResolved

  it('marca el vínculo ended, agrega nota de cierre y no borra nada', async () => {
    const { sb, calls } = mockSb({ person: { id: 'p1', name: 'Ana', notes: 'algo previo', relationship: 'romantic' } })
    const r = await executeProposedAction(sb, 'u1', cierre)
    expect(r.ok).toBe(true)
    expect(r.message).toContain('Ana')
    expect(r.message).toMatch(/no borré nada/i)
    // insertó una relationship con status ended y depth/reciprocity VÁLIDOS (no 0)
    expect(calls.relInsert).toMatchObject({ user_id: 'u1', person_id: 'p1', status: 'ended', depth: 5, reciprocity: 5 })
    // nota de cierre appendeada (no reemplaza la previa)
    expect((calls.peopleUpdate as { notes: string }).notes).toMatch(/algo previo[\s\S]*Vínculo cerrado/)
  })

  it('pausa los objetivos activos ligados a la persona', async () => {
    const { sb, calls } = mockSb({ linkedGoals: [{ id: 'g1' }, { id: 'g2' }] })
    const r = await executeProposedAction(sb, 'u1', cierre)
    expect(r.ok).toBe(true)
    expect(r.message).toMatch(/2 objetivo/)
    expect(calls.goalUpdate).toMatchObject({ status: 'paused' })
  })

  it('usa update (no insert) si ya existe una fila de relationship', async () => {
    const { sb, calls } = mockSb({ existingRel: { id: 'rel_x' } })
    await executeProposedAction(sb, 'u1', cierre)
    expect(calls.relUpdate).toMatchObject({ status: 'ended' })
    expect(calls.relInsert).toBeUndefined()
  })

  it('falla si la persona no existe', async () => {
    const { sb } = mockSb({ person: null })
    const r = await executeProposedAction(sb, 'u1', cierre)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/no encontré/i)
  })

  it('ok:false si no se pudo marcar el vínculo (insert falla)', async () => {
    const { sb } = mockSb({ relInsertError: { message: 'boom' } })
    const r = await executeProposedAction(sb, 'u1', cierre)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/web|reintent/i)
  })
})

describe('executeProposedAction — agregar_hito', () => {
  const hito: ProposedActionResolved = {
    kind: 'agregar_hito', objetivo: 'Mundial de Bomberos', hito: 'Pasar examen médico IPD', fecha: '2026-08-15', objetivoId: 'g1',
  } as ProposedActionResolved

  it('appendea el milestone al array existente y toca updated_at', async () => {
    const { sb, calls } = mockSb({ goal: { id: 'g1', title: 'Mundial de Bomberos', milestones: [{ id: 'm0', title: 'previo', completed: true }] } })
    const r = await executeProposedAction(sb, 'u1', hito)
    expect(r.ok).toBe(true)
    expect(r.message).toContain('Pasar examen médico IPD')
    expect(r.message).toContain('Mundial de Bomberos')
    const upd = calls.goalUpdate as { milestones: Array<Record<string, unknown>>; updated_at: string }
    expect(upd.milestones).toHaveLength(2) // no pisa el previo
    expect(upd.milestones[0]).toMatchObject({ id: 'm0' })
    expect(upd.milestones[1]).toMatchObject({ title: 'Pasar examen médico IPD', completed: false, dueDate: '2026-08-15' })
    expect(String(upd.milestones[1].id)).toMatch(/^m_/)
    expect(typeof upd.updated_at).toBe('string')
  })

  it('dueDate null si la fecha no es ISO; arranca array vacío', async () => {
    const { sb, calls } = mockSb({ goal: { id: 'g1', title: 'Norte', milestones: null } })
    const r = await executeProposedAction(sb, 'u1', { ...hito, fecha: 'en agosto' } as ProposedActionResolved)
    expect(r.ok).toBe(true)
    const upd = calls.goalUpdate as { milestones: Array<Record<string, unknown>> }
    expect(upd.milestones).toHaveLength(1)
    expect(upd.milestones[0]).toMatchObject({ dueDate: null })
  })

  it('falla sin objetivoId resuelto (no escribe)', async () => {
    const { sb, calls } = mockSb({ goal: { id: 'g1', title: 'X' } })
    const r = await executeProposedAction(sb, 'u1', { ...hito, objetivoId: null } as ProposedActionResolved)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/no encontré/i)
    expect(calls.goalUpdate).toBeUndefined()
  })

  it('falla si el objetivo no existe / es ajeno', async () => {
    const { sb } = mockSb({ goal: null })
    const r = await executeProposedAction(sb, 'u1', hito)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/no encontré/i)
  })
})

describe('isExecutableByChat', () => {
  it('las acciones habilitadas por chat', () => {
    expect(isExecutableByChat('registrar_interaccion')).toBe(true)
    expect(isExecutableByChat('crear_objetivo')).toBe(true)
    expect(isExecutableByChat('crear_persona')).toBe(true)
    expect(isExecutableByChat('cerrar_relacion')).toBe(true)
    expect(isExecutableByChat('agregar_hito')).toBe(true)
    expect(isExecutableByChat('otra_cosa')).toBe(false)
  })
})

// El 29-jul Aaron avisó que a Diana Díaz le vino la regla. La marca iba a
// `person_cycles`, pero `people.cycle_start_date` —que leen /api/briefing/daily,
// /api/care/upcoming y /api/ciclo/event-brief— se quedaba con el ancla vieja: la
// de ella llevaba 64 días sin moverse. Marcar el período y que la mitad del
// sistema no se enterara es peor que no marcarlo: da una fase con cara de precisa.
describe('executeProposedAction — registrar_estado y el ancla del ciclo', () => {
  const marca = (estado: 'regla' | 'animo_bajo', fecha: string): ProposedActionResolved =>
    ({ kind: 'registrar_estado', persona: 'Diana', personId: 'p1', estado, fecha, nota: '' } as ProposedActionResolved)

  it('un período NUEVO adelanta people.cycle_start_date', async () => {
    const { sb, calls } = mockSb({ person: { id: 'p1', name: 'Diana Díaz', cycle_start_date: '2026-05-26' } as never })
    const r = await executeProposedAction(sb as unknown as SupabaseClient, 'u1', marca('regla', '2026-07-28'))
    expect(r.ok).toBe(true)
    expect(calls.cycleInsert).toMatchObject({ date: '2026-07-28', phase: 'bleeding' })
    expect(calls.peopleUpdate).toEqual({ cycle_start_date: '2026-07-28' })
  })

  it('un período VIEJO que faltaba NO pisa un ancla más reciente', async () => {
    const { sb, calls } = mockSb({ person: { id: 'p1', name: 'Diana Díaz', cycle_start_date: '2026-07-28' } as never })
    await executeProposedAction(sb as unknown as SupabaseClient, 'u1', marca('regla', '2026-06-30'))
    expect(calls.cycleInsert).toMatchObject({ date: '2026-06-30' })   // la marca sí se guarda
    expect(calls.peopleUpdate).toBeUndefined()                        // el ancla no se mueve
  })

  it('sin ancla previa, la primera marca la establece', async () => {
    const { sb, calls } = mockSb({ person: { id: 'p1', name: 'Diana', cycle_start_date: null } as never })
    await executeProposedAction(sb as unknown as SupabaseClient, 'u1', marca('regla', '2026-07-28'))
    expect(calls.peopleUpdate).toEqual({ cycle_start_date: '2026-07-28' })
  })

  it('un ánimo bajo NO toca el ancla del ciclo', async () => {
    const { sb, calls } = mockSb({ person: { id: 'p1', name: 'Diana', cycle_start_date: '2026-05-26' } as never })
    await executeProposedAction(sb as unknown as SupabaseClient, 'u1', marca('animo_bajo', '2026-07-28'))
    expect(calls.cycleInsert).toMatchObject({ phase: 'pms' })
    expect(calls.peopleUpdate).toBeUndefined()
  })
})
