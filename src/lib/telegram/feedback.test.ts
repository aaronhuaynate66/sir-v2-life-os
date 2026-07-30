import { describe, it, expect } from 'vitest'

import { feedbackButtons, parseFeedbackCallback } from './feedback'

const ISO = '2026-07-30T16:45:12.345Z'

describe('feedbackButtons', () => {
  it('devuelve los dos botones con el iso como id', () => {
    const b = feedbackButtons(ISO)
    expect(b).toHaveLength(2)
    expect(b[0].callbackData).toBe(`fb|u|${ISO}`)
    expect(b[1].callbackData).toBe(`fb|d|${ISO}`)
    expect(b[0].text).toMatch(/👍/)
    expect(b[1].text).toMatch(/👎/)
  })

  it('SIN timestamp no ofrece botones', () => {
    // Un botón que no puede guardar nada es peor que ninguno: el usuario toca,
    // no pasa nada, y deja de confiar en el control.
    expect(feedbackButtons(null)).toEqual([])
    expect(feedbackButtons(undefined)).toEqual([])
    expect(feedbackButtons('')).toEqual([])
  })

  it('el callback_data CABE en los 64 bytes de Telegram', () => {
    // Si se pasa, Telegram rechaza el mensaje entero y la respuesta no llega.
    for (const b of feedbackButtons(ISO)) {
      expect(Buffer.byteLength(b.callbackData!, 'utf8')).toBeLessThanOrEqual(64)
    }
  })
})

describe('parseFeedbackCallback', () => {
  it('parsea los dos ratings', () => {
    expect(parseFeedbackCallback(`fb|u|${ISO}`)).toEqual({ rating: 'up', sirAt: ISO })
    expect(parseFeedbackCallback(`fb|d|${ISO}`)).toEqual({ rating: 'down', sirAt: ISO })
  })

  it('ida y vuelta con feedbackButtons', () => {
    const [up, down] = feedbackButtons(ISO)
    expect(parseFeedbackCallback(up.callbackData!)?.rating).toBe('up')
    expect(parseFeedbackCallback(down.callbackData!)?.rating).toBe('down')
    expect(parseFeedbackCallback(up.callbackData!)?.sirAt).toBe(ISO)
  })

  it('ignora callbacks de OTROS botones sin confundirse', () => {
    // El webhook rutea varios prefijos; este parser no puede quedarse con los
    // ajenos ni tirar por un dato que no es suyo.
    for (const otro of ['hb|abc', 'sv|xyz|1', 'wq|123', 'br|hecho|ref', 'wi|p|id', '']) {
      expect(parseFeedbackCallback(otro), otro).toBeNull()
    }
  })

  it('rechaza lo mal formado en vez de adivinar', () => {
    for (const malo of ['fb|', 'fb|u', 'fb|u|', 'fb||iso', 'fb|x|' + ISO, 'fb|up|' + ISO]) {
      expect(parseFeedbackCallback(malo), malo).toBeNull()
    }
  })

  it('un iso con | adentro no rompe el parseo (se corta en el PRIMER separador)', () => {
    const raro = '2026-07-30T00:00:00.000Z|extra'
    expect(parseFeedbackCallback(`fb|u|${raro}`)).toEqual({ rating: 'up', sirAt: raro })
  })
})
