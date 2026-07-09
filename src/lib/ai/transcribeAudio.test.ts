// SIR V2 — Tests de la transcripción de audio (Whisper).

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { transcribeAudio } from './transcribeAudio'

describe('transcribeAudio', () => {
  const OLD = process.env.OPENAI_API_KEY
  beforeEach(() => { process.env.OPENAI_API_KEY = 'sk-test' })
  afterEach(() => { vi.unstubAllGlobals(); process.env.OPENAI_API_KEY = OLD })

  it('devuelve el texto (response_format=text) y usa la extensión ogg', async () => {
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      const form = init?.body as FormData
      const file = form.get('file') as File
      expect(file.name).toBe('audio.ogg') // opus → ogg
      expect(form.get('model')).toBe('whisper-1')
      return new Response('Hola, vi a Diana hoy', { status: 200 })
    })
    vi.stubGlobal('fetch', f)
    const text = await transcribeAudio(new ArrayBuffer(8), 'audio/ogg; codecs=opus')
    expect(text).toBe('Hola, vi a Diana hoy')
  })

  it('sin OPENAI_API_KEY → lanza', async () => {
    delete process.env.OPENAI_API_KEY
    await expect(transcribeAudio(new ArrayBuffer(4), 'audio/ogg')).rejects.toThrow()
  })

  it('error de API → lanza', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))
    await expect(transcribeAudio(new ArrayBuffer(4), 'audio/mpeg')).rejects.toThrow()
  })
})
