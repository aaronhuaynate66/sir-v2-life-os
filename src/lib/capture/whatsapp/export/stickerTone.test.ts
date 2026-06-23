import { describe, it, expect } from 'vitest'
import { isStickerFileName, injectStickerTones } from './stickerTone'
describe('stickerTone', () => {
  it('detecta .webp como sticker (no jpg/opus)', () => {
    expect(isStickerFileName('STK-2026.webp')).toBe(true)
    expect(isStickerFileName('PHOTO-2026.jpg')).toBe(false)
    expect(isStickerFileName('PTT.opus')).toBe(false)
  })
  it('anota el tono inline reemplazando el adjunto', () => {
    const text = '[01/01/26, 10:00:00] Ana: <adjunto: stk1.webp>'
    const out = injectStickerTones(text, new Map([['stk1.webp', 'cariño/humor']]))
    expect(out).toContain('envió un sticker · tono: cariño/humor')
    expect(out).not.toContain('stk1.webp')
  })
})
