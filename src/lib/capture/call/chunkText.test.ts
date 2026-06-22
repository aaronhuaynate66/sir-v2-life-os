import { describe, it, expect } from 'vitest'
import { chunkText } from './chunkText'

describe('chunkText', () => {
  it('texto vacío → []', () => {
    expect(chunkText('')).toEqual([])
    expect(chunkText('   \n  ')).toEqual([])
  })
  it('llamada corta → un solo bloque', () => {
    const t = 'Yo: hola\nElla: hola, ¿cómo estás?\nYo: bien'
    expect(chunkText(t)).toEqual([t])
  })
  it('respeta el techo de bloques y no pierde contenido', () => {
    const lines = Array.from({ length: 500 }, (_, i) => `Hablante: línea número ${i} con algo de relleno para ocupar espacio`)
    const t = lines.join('\n')
    const out = chunkText(t, { targetChars: 2000, maxChunks: 4 })
    expect(out.length).toBeLessThanOrEqual(4)
    expect(out.length).toBeGreaterThan(1)
    // No se pierde ninguna línea
    const joined = out.join('\n')
    for (let i = 0; i < 500; i++) expect(joined).toContain(`línea número ${i} `)
  })
  it('nunca corta una línea a la mitad', () => {
    const t = ['a'.repeat(5000), 'b'.repeat(5000), 'c'.repeat(5000)].join('\n')
    const out = chunkText(t, { targetChars: 4000, maxChunks: 8 })
    for (const c of out) {
      // cada bloque es una o más líneas completas
      for (const line of c.split('\n')) expect(/^a+$|^b+$|^c+$/.test(line)).toBe(true)
    }
  })
})
