// SIR V2 — Tests del read-back verify de la captura de báscula.
//
// waitForRowsConfirmed es la defensa contra el falso "guardado": confirma que
// los rows llegaron a DB antes de que la UI lo cante. Cubrimos: éxito al primer
// intento, éxito tras reintentos, timeout (todos los intentos sin confirmar),
// ids vacío, y checkConfirmed que rechaza (se trata como 0 y sigue).

import { describe, it, expect } from 'vitest'

import { waitForRowsConfirmed } from './confirm'

const noSleep = () => Promise.resolve()
const DELAYS = [0, 1, 1, 1] as const

describe('waitForRowsConfirmed', () => {
  it('confirma al primer intento cuando todos los ids ya están en DB', async () => {
    let calls = 0
    const ok = await waitForRowsConfirmed(
      ['a', 'b'],
      async () => {
        calls++
        return 2
      },
      noSleep,
      DELAYS,
    )
    expect(ok).toBe(true)
    expect(calls).toBe(1)
  })

  it('reintenta y confirma cuando el push tarda un par de ticks', async () => {
    let calls = 0
    const ok = await waitForRowsConfirmed(
      ['a', 'b', 'c'],
      async () => {
        calls++
        // recién en el 3er chequeo aparecen los 3 rows
        return calls >= 3 ? 3 : calls
      },
      noSleep,
      DELAYS,
    )
    expect(ok).toBe(true)
    expect(calls).toBe(3)
  })

  it('devuelve false si nunca se confirman todos (timeout, sin pérdida de datos)', async () => {
    let calls = 0
    const ok = await waitForRowsConfirmed(
      ['a', 'b'],
      async () => {
        calls++
        return 1 // siempre falta uno
      },
      noSleep,
      DELAYS,
    )
    expect(ok).toBe(false)
    expect(calls).toBe(DELAYS.length)
  })

  it('con lista de ids vacía confirma de inmediato sin chequear', async () => {
    let calls = 0
    const ok = await waitForRowsConfirmed(
      [],
      async () => {
        calls++
        return 0
      },
      noSleep,
      DELAYS,
    )
    expect(ok).toBe(true)
    expect(calls).toBe(0)
  })

  it('trata un checkConfirmed que rechaza como 0 y sigue reintentando', async () => {
    let calls = 0
    const ok = await waitForRowsConfirmed(
      ['a'],
      async () => {
        calls++
        if (calls < 2) throw new Error('network blip')
        return 1
      },
      noSleep,
      DELAYS,
    )
    expect(ok).toBe(true)
    expect(calls).toBe(2)
  })
})
