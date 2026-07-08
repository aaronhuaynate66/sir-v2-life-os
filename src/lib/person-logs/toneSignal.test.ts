import { describe, it, expect } from 'vitest'

import { isToneBearingInteraction } from './toneSignal'

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
