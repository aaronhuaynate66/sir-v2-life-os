import { describe, it, expect } from 'vitest'
import { classifyAiError } from './track'

describe('classifyAiError', () => {
  it('detecta saldo agotado de la API (el caso que motivó esto)', () => {
    expect(classifyAiError({
      status: 502,
      message: 'Falló la llamada al modelo de síntesis',
      detail: '400 {"type":"error","error":{"message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}',
    })).toBe('insufficient_credits')
  })

  it('rate limit (429) y overloaded (529)', () => {
    expect(classifyAiError({ status: 429 })).toBe('rate_limited')
    expect(classifyAiError({ status: 529 })).toBe('overloaded')
    expect(classifyAiError({ status: 200, detail: 'overloaded_error' })).toBe('overloaded')
  })

  it('timeout y red caída', () => {
    expect(classifyAiError({ status: 504 })).toBe('timeout')
    expect(classifyAiError({ status: 0 })).toBe('network')
  })

  it('otro por defecto', () => {
    expect(classifyAiError({ status: 500, message: 'boom' })).toBe('other')
    expect(classifyAiError({})).toBe('other')
  })
})
