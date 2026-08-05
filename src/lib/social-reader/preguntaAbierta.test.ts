// SIR V2 — Tests de "responder sin citar".
//
// El caso real (2-ago-2026 22:54): SIR preguntó de quién era @pvalera24 y pidió
// "respóndeme a este mensaje con su nombre". Aaron escribió "Es pedro Valera" sin
// usar el gesto de responder de Telegram → el handle no se recuperó, la ficha
// nunca se creó, y el mensaje cayó al chat general donde SIR alucinó que Pedro
// Valera era su médico maxilofacial.
import { describe, it, expect } from 'vitest'
import {
  handlePendiente, pareceUnNombre, nombreLimpio, esTarjetaDeIdentidad, VENTANA_MINUTOS,
  type HandlePreguntado,
} from './preguntaAbierta'

const AHORA = new Date('2026-08-02T22:54:00-05:00')
const preguntado = (min: number, handle = 'pvalera24'): HandlePreguntado => ({
  handle, askedAt: new Date(AHORA.getTime() - min * 60_000).toISOString(),
})

describe('el caso que lo motivó', () => {
  it('"Es pedro Valera" sin citar RECUPERA el handle', () => {
    const r = handlePendiente([preguntado(3)], 'Es pedro Valera', AHORA)!
    expect(r.handle).toBe('pvalera24')
    expect(r.nombre).toBe('pedro Valera')
  })

  it('también sin el prefijo conversacional', () => {
    expect(handlePendiente([preguntado(1)], 'Pedro Valera', AHORA)?.nombre).toBe('Pedro Valera')
    expect(handlePendiente([preguntado(1)], 'se llama Pedro Valera', AHORA)?.nombre).toBe('Pedro Valera')
  })
})

describe('cuándo NO se mete — vale más callarse que crear una ficha mala', () => {
  it('si él está preguntando otra cosa', () => {
    for (const t of ['¿quién es?', 'qué tengo mañana', 'búscame a Pedro', 'dime quién es Pedro']) {
      expect(handlePendiente([preguntado(2)], t, AHORA), t).toBeNull()
    }
  })

  it('si preguntó por DOS cuentas casi a la vez, no adivina', () => {
    // Un nombre suelto es ambiguo con dos pendientes. Asignarlo al azar le
    // ensuciaría el grafo; volver a preguntar cuesta menos.
    expect(handlePendiente([preguntado(3), preguntado(5, 'otracuenta')], 'Pedro Valera', AHORA)).toBeNull()
  })


  it('si pasó demasiado tiempo', () => {
    // Era 30 min y eso solo servía si respondía antes de dormirse: la tarjeta sale
    // 21:00 y el 4-ago él contestó a las 08:44 del día siguiente. 48 h cubre
    // "lo veo a la mañana" y "lo veo el finde".
    expect(VENTANA_MINUTOS).toBe(48 * 60)
    expect(handlePendiente([preguntado(49 * 60)], 'Pedro Valera', AHORA)).toBeNull()
    expect(handlePendiente([preguntado(11 * 60 + 21)], 'Pedro Valera', AHORA)).not.toBeNull()
  })

  it('si el texto es una frase, no un nombre', () => {
    expect(handlePendiente([preguntado(2)], 'Trabajamos hace tiempo en attach juntos en la agencia', AHORA)).toBeNull()
    expect(handlePendiente([preguntado(2)], 'no me acuerdo. después te digo', AHORA)).toBeNull()
  })

  it('si no hay nada preguntado, no se mete', () => {
    expect(handlePendiente([], 'Pedro Valera', AHORA)).toBeNull()
    expect(handlePendiente([{ handle: 'x', askedAt: null }], 'Pedro Valera', AHORA)).toBeNull()
  })

})

describe('pareceUnNombre', () => {
  it('acepta nombres', () => {
    for (const t of ['Pedro Valera', 'Juan Carlos Morales Carpio', 'Delicia', "O'Brien"]) {
      expect(pareceUnNombre(t), t).toBe(true)
    }
  })

  it('rechaza lo que claramente no lo es', () => {
    for (const t of ['', 'ok', '?', 'mándale un mensaje mañana temprano por favor', 'a'.repeat(80)]) {
      expect(pareceUnNombre(t), t).toBe(false)
    }
  })
})

describe('no revienta', () => {
  it('con basura', () => {
    expect(handlePendiente(null as unknown as HandlePreguntado[], 'Pedro', AHORA)).toBeNull()
    expect(handlePendiente([{ handle: 'x', askedAt: 'no-es-fecha' }], 'Pedro Valera', AHORA)).toBeNull()
    expect(esTarjetaDeIdentidad('Vi una historia de @pvalera24 y no sé de quién es.')).toBe(true)
    expect(esTarjetaDeIdentidad('hola')).toBe(false)
    expect(nombreLimpio('')).toBe('')
  })
})
