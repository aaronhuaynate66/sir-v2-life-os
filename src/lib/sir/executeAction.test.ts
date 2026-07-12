import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { executeProposedAction, isExecutableByChat } from './executeAction'
import type { ProposedActionResolved } from './askSir'

// Mock de Supabase que ramifica por tabla y captura lo escrito.
function mockSb(opts: { person?: { id: string; name: string } | null; slugs?: string[] } = {}) {
  const person = opts.person === undefined ? { id: 'p1', name: 'Pablo' } : opts.person
  const slugs = opts.slugs ?? []
  const calls: {
    logInsert?: Record<string, unknown>; memUpsert?: unknown[]
    goalInsert?: Record<string, unknown>; peopleInsert?: Record<string, unknown>
  } = {}
  const thenable = (result: unknown) => ({ then: (res: (v: unknown) => void) => res(result) })
  const sb = {
    from(table: string) {
      if (table === 'people') {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({ data: person }),
          // La query de slugs (select('slug').eq('user_id',…)) se awaitea directo.
          then: (res: (v: unknown) => void) => res({ data: slugs.map((s) => ({ slug: s })), error: null }),
          insert: (row: Record<string, unknown>) => { calls.peopleInsert = row; return thenable({ error: null }) },
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
      if (table === 'goals') {
        return { insert: (row: Record<string, unknown>) => { calls.goalInsert = row; return thenable({ error: null }) } }
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

describe('executeProposedAction — cerrar_relacion (aún web-only)', () => {
  it('devuelve ok:false y deriva a la web', async () => {
    const { sb } = mockSb()
    const r = await executeProposedAction(sb, 'u1', { kind: 'cerrar_relacion', persona: 'Ana', motivo: '', personId: 'p9' } as ProposedActionResolved)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/web/i)
  })
})

describe('isExecutableByChat', () => {
  it('interacción, objetivo y persona sí; cerrar_relacion no (todavía)', () => {
    expect(isExecutableByChat('registrar_interaccion')).toBe(true)
    expect(isExecutableByChat('crear_objetivo')).toBe(true)
    expect(isExecutableByChat('crear_persona')).toBe(true)
    expect(isExecutableByChat('cerrar_relacion')).toBe(false)
  })
})
