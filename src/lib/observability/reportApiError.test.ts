import { describe, it, expect } from 'vitest'
import { isBillingQuotaError } from './reportApiError'

describe('isBillingQuotaError', () => {
  it('EmbeddingError 429 → true (cuota de OpenAI agotada)', () => {
    const e = Object.assign(new Error('Falló la API de embeddings (HTTP 429): ...'), { name: 'EmbeddingError', status: 429 })
    expect(isBillingQuotaError(e)).toBe(true)
  })
  it('mensaje de cuota de cualquier proveedor → true', () => {
    expect(isBillingQuotaError(new Error('You exceeded your current quota, please check your plan and billing details.'))).toBe(true)
  })
  it('error normal → false (sí se reporta)', () => {
    expect(isBillingQuotaError(new Error('TypeError: cannot read property x of undefined'))).toBe(false)
  })
  it('EmbeddingError NO-429 → false (un fallo real de embeddings sí alerta)', () => {
    const e = Object.assign(new Error('Respuesta con cantidad inesperada'), { name: 'EmbeddingError', status: 500 })
    expect(isBillingQuotaError(e)).toBe(false)
  })
  it('no-objeto → false', () => {
    expect(isBillingQuotaError(null)).toBe(false)
    expect(isBillingQuotaError('boom')).toBe(false)
  })
})
