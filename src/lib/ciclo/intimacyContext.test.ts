import { describe, it, expect } from 'vitest'
import { deriveIntimacyContext, type IntimacyLogInput } from './intimacyContext'

const NOW = new Date(2026, 6, 20) // 2026-07-20 local
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString()

function log(partial: Partial<IntimacyLogInput> & { kind: string }): IntimacyLogInput {
  return { value: null, note: null, loggedAt: daysAgo(1), ...partial }
}

describe('deriveIntimacyContext', () => {
  it('sin logs → todo en false (no inventa señal)', () => {
    const ctx = deriveIntimacyContext({ personLogs: [], personName: 'Diana', now: NOW })
    expect(ctx).toEqual({ recentTension: false, lowEnergy: false, cooling: false, personName: 'Diana' })
  })

  it('una interacción tensa reciente (tono ≤2) → recentTension', () => {
    const ctx = deriveIntimacyContext({
      personLogs: [log({ kind: 'interaction', value: 2, note: 'discutimos por la mudanza', loggedAt: daysAgo(3) })],
      now: NOW,
    })
    expect(ctx.recentTension).toBe(true)
  })

  it('una interacción tensa VIEJA (fuera de la ventana) NO cuenta', () => {
    const ctx = deriveIntimacyContext({
      personLogs: [log({ kind: 'interaction', value: 1, note: 'pelea fuerte', loggedAt: daysAgo(40) })],
      now: NOW,
    })
    expect(ctx.recentTension).toBe(false)
  })

  it('un placeholder de llamada con value bajo NO es tono → no dispara tensión', () => {
    const ctx = deriveIntimacyContext({
      personLogs: [log({ kind: 'interaction', value: 1, note: '📞 Llamada de voz · 21 s', loggedAt: daysAgo(2) })],
      now: NOW,
    })
    expect(ctx.recentTension).toBe(false)
  })

  it('mood/energy bajo reciente → lowEnergy', () => {
    const ctx = deriveIntimacyContext({
      personLogs: [log({ kind: 'energy', value: 2, loggedAt: daysAgo(2) })],
      now: NOW,
    })
    expect(ctx.lowEnergy).toBe(true)
  })

  it('un buen tono reciente no marca tensión ni energía baja', () => {
    const ctx = deriveIntimacyContext({
      personLogs: [
        log({ kind: 'interaction', value: 5, note: 'charla linda', loggedAt: daysAgo(1) }),
        log({ kind: 'mood', value: 4, loggedAt: daysAgo(1) }),
      ],
      now: NOW,
    })
    expect(ctx.recentTension).toBe(false)
    expect(ctx.lowEnergy).toBe(false)
  })

  it('override explícito de cooling gana sobre la cadencia', () => {
    const ctx = deriveIntimacyContext({ personLogs: [], cooling: true, now: NOW })
    expect(ctx.cooling).toBe(true)
  })

  it('caída de cadencia de contacto → cooling (con baseline suficiente)', () => {
    const logs: IntimacyLogInput[] = [
      // Baseline (30–90d atrás): contacto frecuente.
      ...[35, 45, 55, 65, 75, 85].map((d) => log({ kind: 'interaction', value: 4, note: 'charla', loggedAt: daysAgo(d) })),
      // Reciente (0–30d): casi nada.
      log({ kind: 'interaction', value: 4, note: 'charla', loggedAt: daysAgo(25) }),
    ]
    const ctx = deriveIntimacyContext({ personLogs: logs, now: NOW })
    expect(ctx.cooling).toBe(true)
  })

  it('sin baseline suficiente NO grita enfriamiento', () => {
    const logs: IntimacyLogInput[] = [
      log({ kind: 'interaction', value: 4, note: 'charla', loggedAt: daysAgo(40) }),
      log({ kind: 'interaction', value: 4, note: 'charla', loggedAt: daysAgo(50) }),
    ]
    const ctx = deriveIntimacyContext({ personLogs: logs, now: NOW })
    expect(ctx.cooling).toBe(false)
  })

  it('cadencia estable → sin cooling', () => {
    const logs: IntimacyLogInput[] = [
      ...[35, 45, 55, 65].map((d) => log({ kind: 'interaction', value: 4, note: 'charla', loggedAt: daysAgo(d) })),
      ...[5, 12, 20, 28].map((d) => log({ kind: 'interaction', value: 4, note: 'charla', loggedAt: daysAgo(d) })),
    ]
    const ctx = deriveIntimacyContext({ personLogs: logs, now: NOW })
    expect(ctx.cooling).toBe(false)
  })
})
