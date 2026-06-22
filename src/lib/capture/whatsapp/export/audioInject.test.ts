import { describe, it, expect } from 'vitest'
import { isAudioFileName, pickRecentAudioRefs, injectAudioTranscripts } from './audioInject'

describe('audioInject', () => {
  it('detecta audios por extensión', () => {
    expect(isAudioFileName('00-AUDIO-2024.opus')).toBe(true)
    expect(isAudioFileName('PTT-2024.m4a')).toBe(true)
    expect(isAudioFileName('foto.jpg')).toBe(false)
    expect(isAudioFileName('__MACOSX/x.opus')).toBe(false)
  })
  it('elige los audios más recientes hasta el cap', () => {
    const text = [
      '[01/01/24, 10:00:00] Ana: <adjunto: a1.opus>',
      '[02/01/24, 10:00:00] Ana: <adjunto: a2.opus>',
      '[03/01/24, 10:00:00] Ana: <adjunto: a3.opus>',
    ].join('\n')
    const picked = pickRecentAudioRefs(text, ['a1.opus', 'a2.opus', 'a3.opus'], 2)
    expect(picked).toEqual(['a3.opus', 'a2.opus'])
  })
  it('con sinceISO, solo elige audios de mensajes POSTERIORES', () => {
    const text = [
      '[01/01/24, 10:00:00] Ana: <adjunto: a1.opus>',
      '[15/06/24, 10:00:00] Ana: <adjunto: a2.opus>',
      '[20/06/24, 10:00:00] Ana: <adjunto: a3.opus>',
    ].join('\n')
    const picked = pickRecentAudioRefs(text, ['a1.opus', 'a2.opus', 'a3.opus'], 25, '2024-06-16T00:00:00.000Z')
    expect(picked).toEqual(['a3.opus']) // a1 (enero) y a2 (15-jun) quedan fuera
  })
  it('inyecta la transcripción reemplazando el adjunto (iOS y Android)', () => {
    const text = [
      '[01/01/24, 10:00:00] Ana: ‎<adjunto: a1.opus>',
      '02/01/24, 10:00 - Ana: a2.opus (archivo adjunto)',
    ].join('\n')
    const out = injectAudioTranscripts(text, new Map([['a1.opus', 'hola que tal'], ['a2.opus', 'nos vemos mañana']]))
    expect(out).toContain('Nota de voz: "hola que tal"')
    expect(out).toContain('Nota de voz: "nos vemos mañana"')
    expect(out).not.toContain('a1.opus')
    expect(out).not.toContain('a2.opus')
  })
  it('deja intacto un audio sin transcripción', () => {
    const text = '[01/01/24, 10:00:00] Ana: <adjunto: a1.opus>'
    const out = injectAudioTranscripts(text, new Map([['a1.opus', '']]))
    expect(out).toContain('a1.opus')
  })
})
