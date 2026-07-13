import { describe, it, expect } from 'vitest'
import { inferCyclesFromWhatsappData } from './fromWhatsappObservation'

const msg = (author: 'user' | 'other', content: string) => ({ timestamp: '10:00', author, content })

describe('inferCyclesFromWhatsappData (screenshot)', () => {
  it('CASO NICOLLE real: pregunta de Aaron + "Me vino el 25 de junio" con conversationDate', () => {
    const out = inferCyclesFromWhatsappData({
      conversationDate: '2026-07-08',
      rawMessages: [
        msg('user', 'solo dime la ultima vez que te vino la regla'),
        msg('user', 'la fecha'),
        msg('other', 'Me vino el 25 de junio'),
      ],
    }, '2026-07-08')
    expect(out).toEqual([{ date: '2026-06-25', phase: 'bleeding', matched: expect.stringContaining('25 de junio') }])
  })

  it('estado en 1ª persona con conversationDate → fecha de la conversación', () => {
    const out = inferCyclesFromWhatsappData({
      conversationDate: '2026-05-08',
      rawMessages: [msg('other', 'ando con la regla, me siento mal')],
    }, '2026-07-13')
    expect(out).toEqual([{ date: '2026-05-08', phase: 'bleeding', matched: expect.any(String) }])
  })

  it('SIN conversationDate: descarta el "estado ahora" (no inventa fecha), conserva fecha explícita', () => {
    const soloEstado = inferCyclesFromWhatsappData({
      conversationDate: null,
      rawMessages: [msg('other', 'estoy con la regla')],
    }, '2026-07-13')
    expect(soloEstado).toHaveLength(0)
    const conFecha = inferCyclesFromWhatsappData({
      conversationDate: null,
      rawMessages: [msg('user', 'cuando te vino?'), msg('other', 'el 25 de junio')],
    }, '2026-07-13')
    expect(conFecha[0]?.date).toBe('2026-06-25')
  })

  it('nunca infiere de los mensajes de Aaron (author user)', () => {
    const out = inferCyclesFromWhatsappData({
      conversationDate: '2026-05-08',
      rawMessages: [msg('user', 'me vino la regla')],
    }, '2026-07-13')
    expect(out).toHaveLength(0)
  })
})
