import { describe, it, expect } from 'vitest'

import { RATE_LIMIT_TIERS, buildKey, type RateLimitBucket } from './config'

describe('buildKey — scoping multi-key', () => {
  it('distinto usuario → distinta key', () => {
    expect(buildKey('userA', 'vision', 60_000)).not.toBe(buildKey('userB', 'vision', 60_000))
  })

  it('distinto bucket → distinta key', () => {
    expect(buildKey('u', 'vision', 60_000)).not.toBe(buildKey('u', 'generation', 60_000))
  })

  it('distinta ventana (tier) → distinta key', () => {
    expect(buildKey('u', 'vision', 60_000)).not.toBe(buildKey('u', 'vision', 3_600_000))
  })

  it('mismos inputs → key estable (determinista)', () => {
    expect(buildKey('u', 'embeddings', 60_000)).toBe(buildKey('u', 'embeddings', 60_000))
    expect(buildKey('u', 'embeddings', 60_000)).toBe('rl:u:embeddings:60000')
  })
})

describe('RATE_LIMIT_TIERS — integridad de config', () => {
  const buckets = Object.keys(RATE_LIMIT_TIERS) as RateLimitBucket[]

  it('los buckets esperados existen', () => {
    expect(buckets.sort()).toEqual(['embeddings', 'generation', 'vision', 'whatsapp_export'])
  })

  it('cada tier tiene limit y windowMs positivos', () => {
    for (const bucket of buckets) {
      for (const tier of RATE_LIMIT_TIERS[bucket]) {
        expect(tier.limit).toBeGreaterThan(0)
        expect(tier.windowMs).toBeGreaterThan(0)
      }
    }
  })

  it('dentro de un bucket, una ventana más larga tolera más requests (no se contradicen)', () => {
    for (const bucket of buckets) {
      const tiers = [...RATE_LIMIT_TIERS[bucket]].sort((a, b) => a.windowMs - b.windowMs)
      for (let i = 1; i < tiers.length; i++) {
        expect(tiers[i].limit).toBeGreaterThanOrEqual(tiers[i - 1].limit)
      }
    }
  })
})
