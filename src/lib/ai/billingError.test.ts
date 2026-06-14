import { describe, it, expect } from 'vitest'
import { isAiCreditError, AI_CREDIT_BANNER } from './billingError'

describe('isAiCreditError', () => {
  it('detecta el mensaje real de Anthropic (credit balance too low)', () => {
    const msg = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'
    expect(isAiCreditError(msg)).toBe(true)
    expect(isAiCreditError(new Error(msg))).toBe(true)
  })

  it('detecta la variante "insufficient credits"', () => {
    expect(isAiCreditError('Usage is blocked due to insufficient credits. Please visit Plans and Billing.')).toBe(true)
  })

  it('detecta sobre un objeto error serializable', () => {
    expect(isAiCreditError({ error: { message: 'purchase credits' } })).toBe(true)
  })

  it('NO marca errores no relacionados (timeout, 500, rate limit)', () => {
    expect(isAiCreditError('fetch failed: ETIMEDOUT')).toBe(false)
    expect(isAiCreditError('500 internal server error')).toBe(false)
    expect(isAiCreditError('429 rate_limit_error: too many requests')).toBe(false)
    expect(isAiCreditError(null)).toBe(false)
    expect(isAiCreditError(undefined)).toBe(false)
  })

  it('el banner menciona dónde recargar', () => {
    expect(AI_CREDIT_BANNER.toLowerCase()).toContain('plans & billing')
  })
})
