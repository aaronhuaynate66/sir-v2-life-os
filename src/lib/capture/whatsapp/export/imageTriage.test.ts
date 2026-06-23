import { describe, it, expect } from 'vitest'
import { isImageFileName, injectImageTexts } from './imageTriage'

describe('imageTriage', () => {
  it('detecta fotos pero no stickers (.webp) ni audios', () => {
    expect(isImageFileName('00-PHOTO-2026.jpg')).toBe(true)
    expect(isImageFileName('IMG-2026.png')).toBe(true)
    expect(isImageFileName('STICKER-2026.webp')).toBe(false)
    expect(isImageFileName('PTT-2026.opus')).toBe(false)
  })
  it('inyecta solo las imágenes con data (las personales no entran al mapa)', () => {
    const text = [
      '[01/01/26, 10:00:00] Ana: <adjunto: doc.jpg>',
      '[01/01/26, 10:01:00] Ana: <adjunto: playa.jpg>',
    ].join('\n')
    const out = injectImageTexts(text, new Map([['doc.jpg', 'Factura N° 123, total S/ 450']]))
    expect(out).toContain('📄 Imagen (documento/captura): Factura N° 123, total S/ 450')
    expect(out).not.toContain('doc.jpg')
    expect(out).toContain('playa.jpg') // personal: queda intacta
  })
})
