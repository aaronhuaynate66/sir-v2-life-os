// SIR V2 — Tests del endpoint GET /api/brain/glow (Cerebro F4 · Surfacing).
//
// Mockeamos el cliente Supabase para verificar:
//  - 401 sin sesion.
//  - 200 con rows vacio si no hay goals (fail-soft, no rompe).
//  - 200 con semilla contextual elegida por scope (day/week/month).
//  - ?seed= explicito respetado, incluso si no matchea el grafo (returns
//    rows: []).
//  - ?limit= clampeado 1..30 (default 8).
//
// La logica pura (pickSeedForContext + describeGlow + diffuse) tiene su propio
// test. Aca verificamos el GATE, los query params y el shape del contrato.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ─── Mock del cliente Supabase ─────────────────────────────────────

interface GoalRow { id: string; title?: string; target_date: string | null; is_anchor: boolean | null; status: 'active' }

const state: {
  user: { id: string } | null
  goals: GoalRow[]
  authError: unknown
} = { user: null, goals: [], authError: null }

/** Fake supabase que:
 *  - Devuelve state.goals para cualquier query a 'goals' (con o sin .eq).
 *  - Devuelve arrays vacios para el resto de tablas del loader.
 *  El truco: cada select() devuelve un objeto thenable QUE ADEMAS tiene .eq().
 *  Si el endpoint hace `await supabase.from('X').select(...).eq(...)`, cae en
 *  eq(). Si es directo (loader lo hace sin eq), cae en .then() thenable. */
function makeThenable<T>(rows: T[]) {
  return {
    eq(_col: string, _val: unknown) { return makeThenable(rows) },
    then<R>(resolve: (v: { data: T[]; error: null }) => R) {
      return Promise.resolve({ data: rows, error: null }).then(resolve)
    },
  }
}

function fakeClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: state.authError }),
    },
    from(table: string) {
      return {
        select: (_columns: string) => {
          if (table === 'goals') return makeThenable(state.goals)
          return makeThenable([])
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeClient() }))

import { GET } from './route'

function req(urlSuffix = ''): NextRequest {
  const url = `http://localhost/api/brain/glow${urlSuffix}`
  return {
    url,
    headers: { get: () => null },
  } as unknown as NextRequest
}

beforeEach(() => {
  state.user = null
  state.goals = []
  state.authError = null
})

// ─── Tests ──────────────────────────────────────────────────────────

describe('GET /api/brain/glow · auth gate', () => {
  it('401 sin sesion', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
  })
})

describe('GET /api/brain/glow · sin data', () => {
  beforeEach(() => { state.user = { id: 'aaron' } })

  it('200 con rows vacio si no hay goals', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.seedNodeKey).toBeNull()
    expect(body.rows).toEqual([])
  })
})

describe('GET /api/brain/glow · semilla contextual', () => {
  beforeEach(() => { state.user = { id: 'aaron' } })

  it('elige el goal con target_date mas proximo futuro (scope=day default)', async () => {
    const inOneMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const inThreeMonths = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    state.goals = [
      { id: 'far', title: 'Far', target_date: inThreeMonths, is_anchor: false, status: 'active' },
      { id: 'near', title: 'Near', target_date: inOneMonth, is_anchor: false, status: 'active' },
    ]
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.seedNodeKey).toBe('goal:near')
  })

  it('scope=week ignora goals cuyo target_date esta mas alla de 7 dias', async () => {
    const inFifteenDays = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    state.goals = [
      { id: 'far', title: 'Far', target_date: inFifteenDays, is_anchor: true, status: 'active' },
    ]
    const res = await GET(req('?scope=week'))
    expect(res.status).toBe(200)
    const body = await res.json()
    // 'far' esta fuera de la ventana de 7 dias, pero es anchor → cae al anchor.
    expect(body.seedNodeKey).toBe('goal:far')
  })

  it('scope=month acepta goals dentro de 30 dias', async () => {
    const inTwentyDays = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    state.goals = [
      { id: 'g1', title: 'G1', target_date: inTwentyDays, is_anchor: false, status: 'active' },
    ]
    const res = await GET(req('?scope=month'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.seedNodeKey).toBe('goal:g1')
  })

  it('cae al anchor cuando no hay goals dentro de la ventana', async () => {
    state.goals = [
      { id: 'sin-fecha', title: 'Sin fecha', target_date: null, is_anchor: true, status: 'active' },
    ]
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.seedNodeKey).toBe('goal:sin-fecha')
  })

  it('cae al primer goal activo si no hay ancla ni target_date futuro', async () => {
    state.goals = [
      { id: 'g1', title: 'G1', target_date: null, is_anchor: false, status: 'active' },
    ]
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.seedNodeKey).toBe('goal:g1')
  })
})

describe('GET /api/brain/glow · ?seed= explicito', () => {
  beforeEach(() => { state.user = { id: 'aaron' } })

  it('respeta ?seed= aunque haya contexto', async () => {
    const inOneMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    state.goals = [
      { id: 'context', title: 'Context', target_date: inOneMonth, is_anchor: false, status: 'active' },
      { id: 'explicit', title: 'Explicit', target_date: null, is_anchor: false, status: 'active' },
    ]
    const res = await GET(req('?seed=goal:explicit'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.seedNodeKey).toBe('goal:explicit')
  })

  it('devuelve rows: [] si el seed explicito no matchea nodo del grafo', async () => {
    state.goals = [
      { id: 'g1', title: 'G1', target_date: null, is_anchor: false, status: 'active' },
    ]
    const res = await GET(req('?seed=goal:fantasma'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.seedNodeKey).toBe('goal:fantasma')
    expect(body.rows).toEqual([])
  })
})

describe('GET /api/brain/glow · ?limit=', () => {
  beforeEach(() => { state.user = { id: 'aaron' } })

  it('limit clampea a 30 max', async () => {
    state.goals = [{ id: 'g1', title: 'G1', target_date: null, is_anchor: false, status: 'active' }]
    const res = await GET(req('?limit=999'))
    expect(res.status).toBe(200)
    // No podemos verificar el clamp directo (rows vacio sin aristas), pero al
    // menos verificamos que no rompe.
    expect((await res.json()).seedNodeKey).toBe('goal:g1')
  })

  it('limit invalido cae al default', async () => {
    state.goals = [{ id: 'g1', title: 'G1', target_date: null, is_anchor: false, status: 'active' }]
    const res = await GET(req('?limit=NaN'))
    expect(res.status).toBe(200)
    expect((await res.json()).seedNodeKey).toBe('goal:g1')
  })
})
