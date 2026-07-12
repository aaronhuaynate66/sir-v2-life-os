import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { executeProposedAction, isExecutableByChat } from './executeAction'
import type { ProposedActionResolved } from './askSir'

// Mock de Supabase que ramifica por tabla y captura lo insertado.
function mockSb(opts: { person?: { id: string; name: string } | null } = {}) {
  const person = opts.person === undefined ? { id: 'p1', name: 'Pablo' } : opts.person
  const calls: { logInsert?: Record<string, unknown>; memUpsert?: unknown[] } = {}
  const sb = {
    from(table: string) {
      if (table === 'people') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: person }) }) }) }) }
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
      return {}
    },
  } as unknown as SupabaseClient
  return { sb, calls }
}

const base: ProposedActionResolved = {
  kind: 'registrar_interaccion', persona: 'Pablo', calidad: 5, nota: 'quiere avanzar con la campaña', personId: 'p1',
}

describe('executeProposedAction — registrar_interaccion', () => {
  it('inserta el person_log con el tono y la nota, y materializa la memoria', async () => {
    const { sb, calls } = mockSb()
    const r = await executeProposedAction(sb, 'u1', base)
    expect(r.ok).toBe(true)
    expect(r.message).toContain('Pablo')
    expect(r.message).toContain('5/5')
    expect(calls.logInsert).toMatchObject({ user_id: 'u1', person_id: 'p1', kind: 'interaction', value: 5, note: 'quiere avanzar con la campaña' })
    // La nota real se materializa como memoria (para el briefing de persona).
    expect(calls.memUpsert).toHaveLength(1)
  })

  it('falla claro si la acción no trae personId resuelto', async () => {
    const { sb, calls } = mockSb()
    const r = await executeProposedAction(sb, 'u1', { ...base, personId: null })
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/no encontré/i)
    expect(calls.logInsert).toBeUndefined()
  })

  it('falla si la persona no existe / es ajena', async () => {
    const { sb } = mockSb({ person: null })
    const r = await executeProposedAction(sb, 'u1', base)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/no encontré/i)
  })

  it('NO materializa memoria si no hay nota', async () => {
    const { sb, calls } = mockSb()
    const r = await executeProposedAction(sb, 'u1', { ...base, nota: '' })
    expect(r.ok).toBe(true)
    expect(calls.logInsert).toMatchObject({ note: null })
    expect(calls.memUpsert).toBeUndefined()
  })

  it('clampa el tono fuera de rango a 1..5', async () => {
    const { sb, calls } = mockSb()
    await executeProposedAction(sb, 'u1', { ...base, calidad: 9 })
    expect((calls.logInsert as { value: number }).value).toBe(5)
  })
})

describe('executeProposedAction — kinds no soportados por chat aún', () => {
  it('crear_objetivo devuelve ok:false con mensaje que deriva a la web', async () => {
    const { sb } = mockSb()
    const r = await executeProposedAction(sb, 'u1', {
      kind: 'crear_objetivo', titulo: 'X', categoria: 'personal', prioridad: 'high', proximoPaso: '', impactoPaz: 5, personaRelacionada: null,
    } as ProposedActionResolved)
    expect(r.ok).toBe(false)
    expect(r.message).toMatch(/web/i)
  })
})

describe('isExecutableByChat', () => {
  it('solo registrar_interaccion por ahora', () => {
    expect(isExecutableByChat('registrar_interaccion')).toBe(true)
    expect(isExecutableByChat('crear_objetivo')).toBe(false)
    expect(isExecutableByChat('cerrar_relacion')).toBe(false)
  })
})
