import { describe, it, expect } from 'vitest'

import { isToneBearingInteraction, isContactInteraction } from './toneSignal'

describe('isToneBearingInteraction', () => {
  it('excluye llamadas (placeholder de tono)', () => {
    expect(isToneBearingInteraction('📞 Llamada de voz · 21 s · 17:42')).toBe(false)
    expect(isToneBearingInteraction('📞 Llamada de voz perdida · 17:39')).toBe(false)
    expect(isToneBearingInteraction('Llamada de voz · 3 min')).toBe(false)
  })

  it('excluye marcadores de import masivo', () => {
    expect(isToneBearingInteraction('Importado del export de WhatsApp · 5574 mensajes')).toBe(false)
    expect(isToneBearingInteraction('Importado de un chat GRUPAL · 177 mensajes')).toBe(false)
  })

  it('conserva interacciones reales tipeadas', () => {
    expect(isToneBearingInteraction('Buena conversación, estaba de buen humor')).toBe(true)
    expect(isToneBearingInteraction('le molestó la tabla')).toBe(true)
  })

  it('conserva el tono inferido de una conversación', () => {
    expect(isToneBearingInteraction('Tono inferido del chat importado — coordinan asuntos laborales')).toBe(true)
  })

  it('conserva logs sin nota (calificación manual)', () => {
    expect(isToneBearingInteraction(null)).toBe(true)
    expect(isToneBearingInteraction('')).toBe(true)
    expect(isToneBearingInteraction('   ')).toBe(true)
  })
})

describe('isContactInteraction (recencia)', () => {
  it('una llamada CONTESTADA sí es contacto', () => {
    expect(isContactInteraction('📞 Llamada de voz · 21 s · 17:42')).toBe(true)
    expect(isContactInteraction('📞 Videollamada · 3 min')).toBe(true)
  })

  it('una llamada PERDIDA no es contacto', () => {
    expect(isContactInteraction('📞 Llamada de voz perdida · 17:39')).toBe(false)
    expect(isContactInteraction('📞 Videollamada perdida')).toBe(false)
  })

  it('el import-marker no cuenta (el chat ya cuenta por su observedAt)', () => {
    expect(isContactInteraction('Importado del export de WhatsApp · 5574 mensajes')).toBe(false)
  })

  it('interacción tipeada / tono por-día = contacto', () => {
    expect(isContactInteraction('Discusión por ubicación')).toBe(true)
    expect(isContactInteraction('Charla de WhatsApp · plans')).toBe(true)
    expect(isContactInteraction(null)).toBe(true)
  })
})
