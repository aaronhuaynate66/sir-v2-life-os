import { describe, it, expect } from 'vitest'

import { parseWhatsAppExport, isWhatsAppExport, toISO } from './parse'

// Muestras realistas del export (iOS con corchetes, Android con guion).
const IOS = `[12/05/24, 21:03:11] Ana Pérez: Hola, ¿cómo estás?
[12/05/24, 21:04:02] Yo: Todo bien! y vos?
[12/05/24, 21:05:00] Ana Pérez: ‎<adjunto: 00000042-PHOTO-2024-05-12.jpg>
[12/05/24, 21:06:00] Ana Pérez: mira esta foto
de mi viaje a Cusco
[12/05/24, 21:00:00] Los mensajes y las llamadas están cifrados de extremo a extremo.`

const ANDROID = `12/5/24, 21:03 - Ana Pérez: Hola
12/5/24, 21:04 - Yo: hola
12/5/24, 21:05 - Ana Pérez: <Multimedia omitido>
12/5/24, 9:06 p. m. - Yo: jaja`

describe('isWhatsAppExport', () => {
  it('reconoce el formato iOS', () => {
    expect(isWhatsAppExport(IOS)).toBe(true)
  })
  it('reconoce el formato Android', () => {
    expect(isWhatsAppExport(ANDROID)).toBe(true)
  })
  it('rechaza texto cualquiera', () => {
    expect(isWhatsAppExport('Hola, ¿cómo estás? Nos vemos el martes.')).toBe(false)
    expect(isWhatsAppExport('')).toBe(false)
  })
})

describe('parseWhatsAppExport — iOS', () => {
  const p = parseWhatsAppExport(IOS)

  it('detecta formato y participantes', () => {
    expect(p.format).toBe('ios')
    expect(p.participants).toContain('Ana Pérez')
    expect(p.participants).toContain('Yo')
  })

  it('cuenta la línea de sistema (cifrado) aparte, no como mensaje', () => {
    expect(p.systemLineCount).toBe(1)
    expect(p.messages.some((m) => /cifrad/i.test(m.content))).toBe(false)
  })

  it('marca media como [media] sin romper el parseo', () => {
    const media = p.messages.find((m) => m.isMedia)
    expect(media).toBeTruthy()
    expect(media!.content).toBe('[media]')
    expect(p.mediaCount).toBe(1)
  })

  it('une líneas multilínea al mensaje previo', () => {
    const multi = p.messages.find((m) => m.content.startsWith('mira esta foto'))
    expect(multi).toBeTruthy()
    expect(multi!.content).toContain('de mi viaje a Cusco')
  })

  it('resuelve firstISO/lastISO', () => {
    expect(p.firstISO).toBe('2024-05-12T21:03:11.000Z')
    expect(p.lastISO).toBe('2024-05-12T21:06:00.000Z')
  })
})

describe('parseWhatsAppExport — Android', () => {
  const p = parseWhatsAppExport(ANDROID)

  it('detecta formato android', () => {
    expect(p.format).toBe('android')
  })

  it('marca <Multimedia omitido> como media', () => {
    expect(p.mediaCount).toBe(1)
    expect(p.messages.find((m) => m.isMedia)!.content).toBe('[media]')
  })

  it('parsea 12h con p. m. → HH:mm 24h', () => {
    const last = p.messages[p.messages.length - 1]
    expect(last.time).toBe('21:06')
    expect(last.content).toBe('jaja')
  })
})

describe('toISO — desambiguación de orden de fecha', () => {
  it('day-first por defecto (locale es-PE)', () => {
    expect(toISO('12/05/24', '21:03', null)).toBe('2024-05-12T21:03:00.000Z')
  })
  it('detecta MM/DD cuando el 2º número > 12', () => {
    expect(toISO('05/13/24', '09:03', null)).toBe('2024-05-13T09:03:00.000Z')
  })
  it('detecta DD/MM cuando el 1º número > 12', () => {
    expect(toISO('13/05/2024', '09:03', null)).toBe('2024-05-13T09:03:00.000Z')
  })
  it('aplica AM/PM', () => {
    expect(toISO('01/01/24', '12:00', 'a. m.')).toBe('2024-01-01T00:00:00.000Z')
    expect(toISO('01/01/24', '12:00', 'p. m.')).toBe('2024-01-01T12:00:00.000Z')
    expect(toISO('01/01/24', '1:30', 'p. m.')).toBe('2024-01-01T13:30:00.000Z')
  })
  it('rechaza fechas inválidas', () => {
    expect(toISO('99/99/99', '00:00', null)).toBeNull()
    expect(toISO('no-date', '00:00', null)).toBeNull()
  })
})

describe('parseWhatsAppExport — robustez', () => {
  it('texto vacío → sin mensajes', () => {
    const p = parseWhatsAppExport('')
    expect(p.messages).toEqual([])
    expect(p.format).toBe('unknown')
  })

  it('una línea media multilínea no se contamina con texto siguiente', () => {
    // El sticker es media; la línea siguiente (continuación) NO debe anexarse a media.
    const txt = `[01/01/24, 10:00:00] Ana: <adjunto: STICKER.webp>
[01/01/24, 10:01:00] Ana: hola`
    const p = parseWhatsAppExport(txt)
    expect(p.messages[0].content).toBe('[media]')
    expect(p.messages[1].content).toBe('hola')
  })
})
