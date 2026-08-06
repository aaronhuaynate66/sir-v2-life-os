import { describe, expect, it } from 'vitest'

import {
  construirPropuestaDeEncuentro,
  parseRefDeEncuentro,
  proximosDias,
  refDeEncuentro,
  type EntradaDePropuesta,
} from './proponerEncuentro'

const DIANA = '5c23c82c-2beb-401b-8555-706ac0b81248'
// Jueves 6-ago-2026.
const base = (over: Partial<EntradaDePropuesta> = {}): EntradaDePropuesta => ({
  personId: DIANA,
  nombre: 'Diana',
  frase: 'fue un 4, hablamos bien y quedamos en vernos',
  diasDesde: 6,
  huecos: [],
  agendaLegible: true,
  hoyLima: '2026-08-06',
  ...over,
})

describe('el ref cabe en los 64 bytes de Telegram', () => {
  it('ida y vuelta', () => {
    const ref = refDeEncuentro(DIANA, '2026-08-07', '19:00')
    expect(Buffer.byteLength(`br|enc_slot|${ref}`, 'utf8')).toBeLessThanOrEqual(64)
    expect(parseRefDeEncuentro(ref)).toEqual({ personId: DIANA, diaLima: '2026-08-07', horaLima: '19:00' })
  })

  it('rechaza basura sin reventar', () => {
    expect(parseRefDeEncuentro('')).toBeNull()
    expect(parseRefDeEncuentro('nada')).toBeNull()
    expect(parseRefDeEncuentro(`${DIANA}~2026080719`)).toBeNull() // corto
    expect(parseRefDeEncuentro(`${DIANA}~202613071900`)).toBeNull() // mes 13
    expect(parseRefDeEncuentro(`${DIANA}~202608072599`)).toBeNull() // hora 25
  })
})

describe('con huecos calculados: propone y dice que están libres', () => {
  const con = base({
    huecos: [
      { inicio: '2026-08-08T00:00:00Z', diaLima: '2026-08-07', horaLima: '19:00' },
      { inicio: '2026-08-08T16:00:00Z', diaLima: '2026-08-08', horaLima: '11:00' },
    ],
  })

  it('cita el compromiso y dice hace cuánto', () => {
    const p = construirPropuestaDeEncuentro(con)!
    expect(p.text).toContain('Diana')
    expect(p.text).toContain('hace 6 días')
    expect(p.text).toContain('quedamos en vernos')
  })

  it('dice "libre" solo cuando lo sabe, y lista los horarios', () => {
    const p = construirPropuestaDeEncuentro(con)!
    expect(p.text).toContain('Tienes libre')
    expect(p.text).toContain('vie 7 19:00')
    expect(p.text).toContain('sáb 8 11:00')
  })

  it('un botón por hueco + la salida', () => {
    const p = construirPropuestaDeEncuentro(con)!
    expect(p.filas).toHaveLength(3)
    expect(p.filas[0][0].callbackData).toContain('enc_slot')
    expect(p.filas[2][0].text).toContain('Ahora no')
    expect(p.filas[2][0].callbackData).toContain('enc_no')
  })
})

describe('sin huecos: los dos motivos se dicen DISTINTO', () => {
  it('agenda ilegible → NO afirma que esté libre', () => {
    const p = construirPropuestaDeEncuentro(base({ agendaLegible: false }))!
    expect(p.text).toContain('No pude mirar tu agenda')
    expect(p.text).not.toContain('Tienes libre')
  })

  it('agenda leída y llena → lo dice, y no propone una hora a ciegas', () => {
    const p = construirPropuestaDeEncuentro(base({ agendaLegible: true }))!
    expect(p.text).toContain('cargada')
    expect(p.text).not.toContain('Tienes libre')
    expect(p.text).not.toContain('No pude mirar')
  })

  it('ofrece 3 días + salida, con hora por defecto según el día', () => {
    const p = construirPropuestaDeEncuentro(base({ agendaLegible: false }))!
    expect(p.filas).toHaveLength(4)
    // vie 7 entre semana → 19:00 · sáb 8 finde → 11:00
    expect(p.filas[0][0].text).toBe('vie 7 19:00')
    expect(p.filas[1][0].text).toBe('sáb 8 11:00')
    expect(p.filas[2][0].text).toBe('dom 9 11:00')
  })
})

describe('la salida existe SIEMPRE', () => {
  it('en los tres caminos hay "ahora no"', () => {
    for (const e of [
      base({ huecos: [{ inicio: 'x', diaLima: '2026-08-07', horaLima: '19:00' }] }),
      base({ agendaLegible: false }),
      base({ agendaLegible: true }),
    ]) {
      const p = construirPropuestaDeEncuentro(e)!
      expect(p.filas.at(-1)![0].callbackData).toContain('enc_no')
    }
  })
})

describe('bordes', () => {
  it('sin nombre o sin id no arma nada', () => {
    expect(construirPropuestaDeEncuentro(base({ nombre: '   ' }))).toBeNull()
    expect(construirPropuestaDeEncuentro(base({ personId: '' }))).toBeNull()
  })

  it('sin diasDesde no inventa una antigüedad', () => {
    const p = construirPropuestaDeEncuentro(base({ diasDesde: null }))!
    expect(p.text).not.toContain('hace')
  })

  it('proximosDias arranca MAÑANA', () => {
    expect(proximosDias('2026-08-06', 3)).toEqual(['2026-08-07', '2026-08-08', '2026-08-09'])
    expect(proximosDias('no-es-fecha', 3)).toEqual([])
  })
})
