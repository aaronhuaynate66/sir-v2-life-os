// SIR V2 — Tests de "¿se entregó el aviso?".
//
// El caso real: el recordatorio del examen médico del IPD (7-ago-2026 8:10, con
// ayuno de 8 h) se marcaba como avisado sin importar si algún canal había
// entregado. Su única suscripción de Web Push es de Apple y del 13-jun.
import { describe, it, expect } from 'vitest'
import { huboEntrega, resumenDeEntrega, puedeMarcarseAvisado, type Entrega } from './entrega'

const web = (entregado: boolean, detalle?: string): Entrega =>
  ({ canal: 'web-push', entregado, ...(detalle ? { detalle } : {}) })
const tg = (entregado: boolean, detalle?: string): Entrega =>
  ({ canal: 'telegram', entregado, ...(detalle ? { detalle } : {}) })

describe('el caso del examen del IPD', () => {
  it('si NINGÚN canal entregó, el recordatorio NO se cierra', () => {
    const e = [web(false, '410 Gone'), tg(false, 'timeout')]
    expect(huboEntrega(e)).toBe(false)
    expect(puedeMarcarseAvisado(e)).toBe(false)
  })

  it('basta UNO: Telegram salva el aviso con la suscripción de Safari muerta', () => {
    const e = [web(false, '410 Gone: subscription expired'), tg(true)]
    expect(puedeMarcarseAvisado(e)).toBe(true)
  })

  it('el resumen dice qué falló Y qué salvó el aviso', () => {
    const r = resumenDeEntrega([web(false, '410 Gone'), tg(true)])!
    expect(r).toContain('web-push')
    expect(r).toContain('410 Gone')
    expect(r).toContain('entregó por telegram')
  })

  it('cuando no entrega nadie, lo dice sin ambigüedad', () => {
    const r = resumenDeEntrega([web(false, 'x'), tg(false, 'y')])!
    expect(r).toContain('NO se entregó por ningún canal')
  })
})

describe('todo bien', () => {
  it('sin fallas no hay resumen que loguear', () => {
    expect(resumenDeEntrega([web(true), tg(true)])).toBeNull()
  })

  it('un solo canal, entregado', () => {
    expect(puedeMarcarseAvisado([tg(true)])).toBe(true)
    expect(resumenDeEntrega([tg(true)])).toBeNull()
  })
})

describe('no revienta', () => {
  it('sin canales NO se puede afirmar que se avisó', () => {
    // Cero intentos no es una entrega. Si no hubo canales configurados, el
    // recordatorio queda abierto — es lo correcto, no lo cómodo.
    expect(huboEntrega([])).toBe(false)
    expect(puedeMarcarseAvisado([])).toBe(false)
    expect(resumenDeEntrega([])).toBeNull()
  })

  it('con basura', () => {
    expect(huboEntrega(null as unknown as Entrega[])).toBe(false)
    expect(resumenDeEntrega(null as unknown as Entrega[])).toBeNull()
    expect(huboEntrega([null as unknown as Entrega])).toBe(false)
  })
})
