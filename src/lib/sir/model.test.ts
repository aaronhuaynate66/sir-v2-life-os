import { describe, it, expect } from 'vitest'
import { normalizeTier, resolveModel, resolveModelId, SIR_MODELS, DEFAULT_SIR_TIER } from './model'

describe('sir model registry', () => {
  it('normaliza inválidos al default', () => {
    expect(normalizeTier('xxx')).toBe(DEFAULT_SIR_TIER)
    expect(normalizeTier(null)).toBe('sonnet')
    expect(normalizeTier('haiku')).toBe('haiku')
    expect(normalizeTier('oss_llama')).toBe('oss_llama')
  })
  it('resuelve provider + model id por tier', () => {
    expect(resolveModel('sonnet').provider).toBe('anthropic')
    expect(resolveModel('oss_llama').provider).toBe('openrouter')
    expect(resolveModel('oss_llama').envKey).toBe('OPENROUTER_API_KEY')
    expect(resolveModelId('haiku')).toBe(SIR_MODELS.haiku.modelId)
  })
})
