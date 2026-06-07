// SIR V2 — Tests del endpoint POST /api/health/import (sesión-auth).
//
// Mockeamos el cliente Supabase de servidor (sesión + upsert) para verificar el
// GATE de auth, el rechazo de payloads con forma inválida, y que el happy path
// upsertea con el MISMO arbiter idempotente (user_id, external_id) que /ingest y
// devuelve las filas escritas. El parser/validador/summary son los reales.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ─── Mocks ──────────────────────────────────────────────────────────

vi.mock('@/lib/observability/reportApiError', () => ({ reportApiError: vi.fn() }))

interface UpsertCall {
  table: string
  rows: Record<string, unknown>[]
  opts: { onConflict?: string }
}

const state: {
  user: { id: string } | null
  authError: unknown
  upsertCalls: UpsertCall[]
  upsertError: string | null
} = { user: null, authError: null, upsertCalls: [], upsertError: null }

function fakeClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: state.authError }),
    },
    from(table: string) {
      return {
        upsert(rows: Record<string, unknown>[], opts: { onConflict?: string }) {
          state.upsertCalls.push({ table, rows, opts })
          return {
            select: async () =>
              state.upsertError
                ? { data: null, error: { message: state.upsertError } }
                : // Devolvemos las filas "con id" como lo haría PostgREST.
                  { data: rows.map((r, i) => ({ ...r, id: `${table}-${i}` })), error: null },
          }
        },
      }
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fakeClient() }))

import { POST } from './route'

function req(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest
}

beforeEach(() => {
  state.user = null
  state.authError = null
  state.upsertCalls = []
  state.upsertError = null
})

const PAYLOAD = {
  data: {
    metrics: [
      { name: 'weight_body_mass', units: 'kg', data: [{ date: '2026-06-02 07:00:00 -0500', qty: 79.5 }] },
      { name: 'resting_heart_rate', units: 'count/min', data: [{ date: '2026-06-02 06:00:00 -0500', qty: 54 }] },
      {
        name: 'sleep_analysis',
        data: [{ sleepStart: '2026-06-01 23:30:00 -0500', sleepEnd: '2026-06-02 07:00:00 -0500', totalSleep: 7 }],
      },
    ],
  },
}

describe('POST /api/health/import', () => {
  it('401 si no hay sesión', async () => {
    state.user = null
    const res = await POST(req(PAYLOAD))
    expect(res.status).toBe(401)
    expect(state.upsertCalls).toHaveLength(0)
  })

  it('422 si el payload no tiene forma de Health Auto Export', async () => {
    state.user = { id: 'u1' }
    const res = await POST(req({ hola: 'mundo' }))
    expect(res.status).toBe(422)
    expect(state.upsertCalls).toHaveLength(0)
  })

  it('happy path: upsertea con arbiter (user_id, external_id) y devuelve filas', async () => {
    state.user = { id: 'u1' }
    const res = await POST(req(PAYLOAD))
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      ok: boolean
      healthMetrics: number
      sleepRecords: number
      daysCovered: number
      healthRows: Record<string, unknown>[]
      sleepRows: Record<string, unknown>[]
    }
    expect(json.ok).toBe(true)
    expect(json.healthMetrics).toBe(2) // weight + resting_heart_rate
    expect(json.sleepRecords).toBe(1)
    expect(json.daysCovered).toBe(1) // todo cae en 2026-06-02 (sueño = día del despertar)
    expect(json.healthRows).toHaveLength(2)
    expect(json.sleepRows).toHaveLength(1)

    const health = state.upsertCalls.find((c) => c.table === 'health_metrics')!
    const sleep = state.upsertCalls.find((c) => c.table === 'sleep_records')!
    expect(health.opts.onConflict).toBe('user_id,external_id')
    expect(sleep.opts.onConflict).toBe('user_id,external_id')
    // user_id de la SESIÓN + source apple_health + external_id determinístico.
    expect(health.rows[0]).toMatchObject({ user_id: 'u1', source: 'apple_health' })
    expect(health.rows.every((r) => typeof r.external_id === 'string')).toBe(true)
  })

  it('200 con ceros y sin upsert si no hay métricas mapeables', async () => {
    state.user = { id: 'u1' }
    const res = await POST(req({ data: { metrics: [{ name: 'height', data: [{ date: '2026-06-02', qty: 1.75 }] }] } }))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { healthMetrics: number; sleepRecords: number; skipped: string[] }
    expect(json.healthMetrics).toBe(0)
    expect(json.sleepRecords).toBe(0)
    expect(json.skipped).toContain('height')
    expect(state.upsertCalls).toHaveLength(0)
  })

  it('502 si el upsert falla', async () => {
    state.user = { id: 'u1' }
    state.upsertError = 'boom'
    const res = await POST(req(PAYLOAD))
    expect(res.status).toBe(502)
  })
})
