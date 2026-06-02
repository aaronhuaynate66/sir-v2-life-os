// SIR V2 — Tests de las primitivas de error de API en el cliente.
//
// parseErrorResponse (desde una Response !ok) y toApiError (normalización de
// catch) son la base que ahora comparten /buscar, briefing, resumen y
// síntesis. Cubrimos el parseo tolerante (body ausente / no-JSON / campos
// mal tipados) y la normalización de valores capturados.

import { describe, it, expect } from 'vitest'

import { parseErrorResponse, toApiError, withTimeoutHint, type ApiError } from './errors'

/** Mock mínimo de Response: solo status + json(). */
function fakeResponse(status: number, jsonImpl: () => Promise<unknown>): Response {
  return { status, json: jsonImpl } as unknown as Response
}

describe('parseErrorResponse', () => {
  it('usa error/detail del body cuando vienen bien', async () => {
    const res = fakeResponse(502, async () => ({ error: 'Falló el modelo', detail: 'timeout' }))
    expect(await parseErrorResponse(res)).toEqual<ApiError>({
      status: 502,
      message: 'Falló el modelo',
      detail: 'timeout',
    })
  })

  it('cae a `HTTP <status>` si falta el campo error', async () => {
    const res = fakeResponse(500, async () => ({}))
    expect(await parseErrorResponse(res)).toEqual<ApiError>({ status: 500, message: 'HTTP 500' })
  })

  it('tolera body no-JSON (json() tira) -> usa el status', async () => {
    const res = fakeResponse(503, async () => {
      throw new SyntaxError('Unexpected token')
    })
    expect(await parseErrorResponse(res)).toEqual<ApiError>({ status: 503, message: 'HTTP 503' })
  })

  it('ignora error/detail con tipo incorrecto', async () => {
    const res = fakeResponse(400, async () => ({ error: 42, detail: { x: 1 } }))
    expect(await parseErrorResponse(res)).toEqual<ApiError>({ status: 400, message: 'HTTP 400' })
  })

  it('detail vacío -> undefined (no string vacío)', async () => {
    const res = fakeResponse(404, async () => ({ error: 'No encontrado', detail: '' }))
    const out = await parseErrorResponse(res)
    expect(out.detail).toBeUndefined()
  })
})

describe('toApiError', () => {
  it('pasa-through un ApiError ya formado (status numérico)', () => {
    const err: ApiError = { status: 422, message: 'Sin contexto', detail: 'd' }
    expect(toApiError(err)).toEqual(err)
  })

  it('envuelve un Error de red con status 0', () => {
    expect(toApiError(new Error('Failed to fetch'))).toEqual<ApiError>({
      status: 0,
      message: 'Failed to fetch',
    })
  })

  it('envuelve un valor no-Error (string) con status 0', () => {
    expect(toApiError('boom')).toEqual<ApiError>({ status: 0, message: 'boom' })
  })

  it('un objeto sin status numérico se trata como desconocido (status 0)', () => {
    const out = toApiError({ message: 'x' })
    expect(out.status).toBe(0)
  })
})

describe('withTimeoutHint', () => {
  it('reescribe 504/408/524 a un mensaje accionable de timeout', () => {
    for (const status of [408, 504, 524]) {
      const out = withTimeoutHint({ status, message: 'HTTP ' + status })
      expect(out.status).toBe(status)
      expect(out.message).toBe('La generación tardó demasiado')
      expect(out.detail).toContain('Reintentá')
    }
  })

  it('deja pasar otros statuses sin tocar (incluye nuestro 502 con JSON)', () => {
    const err: ApiError = { status: 502, message: 'Plan vacío del modelo', detail: 'x' }
    expect(withTimeoutHint(err)).toEqual(err)
    const net: ApiError = { status: 0, message: 'Red caída' }
    expect(withTimeoutHint(net)).toEqual(net)
  })
})
