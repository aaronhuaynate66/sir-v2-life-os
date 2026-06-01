import { describe, it, expect } from 'vitest'

import { decide } from './window'
import type { RateTier } from './config'

const TIER: RateTier = { limit: 10, windowMs: 60_000 }
const W0 = 1_000_000_000_000 // window_start arbitrario

describe('decide — fixed window', () => {
  it('permite por debajo del límite y reporta remaining', () => {
    const d = decide(1, W0, W0 + 1_000, TIER)
    expect(d.allowed).toBe(true)
    expect(d.remaining).toBe(9)
    expect(d.retryAfterSec).toBe(0)
  })

  it('borde exacto: el request #limit (hits=limit) se PERMITE, remaining 0', () => {
    const d = decide(10, W0, W0 + 1_000, TIER)
    expect(d.allowed).toBe(true)
    expect(d.remaining).toBe(0)
    expect(d.retryAfterSec).toBe(0)
  })

  it('borde exacto: el request #limit+1 (hits=11) se DENIEGA', () => {
    const d = decide(11, W0, W0 + 1_000, TIER)
    expect(d.allowed).toBe(false)
    expect(d.remaining).toBe(0)
    expect(d.retryAfterSec).toBeGreaterThan(0)
  })

  it('retryAfter = ceil(segundos hasta el reset), mínimo 1', () => {
    // ventana 60s, faltan 59.5s para el reset → ceil = 60
    const d = decide(15, W0, W0 + 500, TIER)
    expect(d.retryAfterSec).toBe(60)
    expect(d.resetAtMs).toBe(W0 + 60_000)
  })

  it('retryAfter nunca baja de 1 aunque el reset esté casi cumplido', () => {
    // faltan 10ms para el reset → ceil(0.01)=1, pero clamp a min 1 igual
    const d = decide(15, W0, W0 + 59_990, TIER)
    expect(d.retryAfterSec).toBe(1)
  })

  it('reset: tras vencer la ventana, el RPC devuelve hits=1 con window_start nuevo → se permite', () => {
    // Simula el estado post-reset que produce el SQL: contador en 1, ventana fresca.
    const freshStart = W0 + 60_001
    const d = decide(1, freshStart, freshStart + 5, TIER)
    expect(d.allowed).toBe(true)
    expect(d.remaining).toBe(9)
  })

  it('respeta distintos tiers (límite/ventana) de forma independiente', () => {
    const hourTier: RateTier = { limit: 100, windowMs: 3_600_000 }
    const underHour = decide(50, W0, W0 + 1000, hourTier)
    expect(underHour.allowed).toBe(true)
    expect(underHour.remaining).toBe(50)

    const overHour = decide(101, W0, W0 + 1000, hourTier)
    expect(overHour.allowed).toBe(false)
    expect(overHour.resetAtMs).toBe(W0 + 3_600_000)
  })
})
