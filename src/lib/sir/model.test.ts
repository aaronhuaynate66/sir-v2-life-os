import { describe, it, expect } from 'vitest'
import { normalizeTier, resolveModelId, SIR_MODELS, DEFAULT_SIR_TIER } from './model'

describe('sir model registry', () => {
  it('normaliza valores inválidos al default', () => {
    expect(normalizeTier('xxx')).toBe(DEFAULT_SIR_TIER)
    expect(normalizeTier(null)).toBe('sonnet')
    expect(normalizeTier('haiku')).toBe('haiku')
  })
  it('resuelve model id por tier', () => {
    expect(resolveModelId('haiku')).toBe(SIR_MODELS.haiku.modelId)
    expect(resolveModelId(undefined)).toBe(SIR_MODELS.sonnet.modelId)
  })
})
