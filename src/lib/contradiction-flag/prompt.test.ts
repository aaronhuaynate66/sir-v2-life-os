import { describe, it, expect } from 'vitest'

import {
  buildTranscript,
  buildContradictionInput,
  parseContradictionFindings,
  NOTE_SOURCE_LABEL,
  type ManualNote,
} from './prompt'

describe('buildTranscript', () => {
  const rows = [
    { sender: 'user', content: 'hola' },
    { sender: 'other', content: 'holaa' },
    { sender: 'other', content: '[media]', is_media: true },
    { sender: 'user', content: '   ' },
    { sender: 'other', content: 'todo bien?' },
  ]

  it('etiqueta con Aaron / nombre y filtra media + vacíos', () => {
    const t = buildTranscript(rows, 'Diana')
    expect(t).toBe('Aaron: hola\nDiana: holaa\nDiana: todo bien?')
  })

  it('respeta el budget quedándose con la cola MÁS reciente', () => {
    const t = buildTranscript(rows, 'Diana', 20)
    // Debe conservar la(s) última(s) línea(s), no las primeras.
    expect(t.endsWith('Diana: todo bien?')).toBe(true)
    expect(t.startsWith('Aaron: hola')).toBe(false)
  })

  it('colapsa espacios internos', () => {
    const t = buildTranscript([{ sender: 'user', content: 'a\n\n b   c' }], 'X')
    expect(t).toBe('Aaron: a b c')
  })
})

describe('buildContradictionInput', () => {
  const notes: ManualNote[] = [
    { ref: 0, source: 'perfil', text: 'No tiene pareja' },
    { ref: 1, source: 'friccion', text: 'Nunca responde rápido', date: '2026-06-01' },
  ]

  it('numera cada nota con su ref y etiqueta la fuente', () => {
    const input = buildContradictionInput('Diana', notes, 'Aaron: hola', 42)
    expect(input).toContain('[0] (Perfil) No tiene pareja')
    expect(input).toContain(`[1] (${NOTE_SOURCE_LABEL.friccion} · 2026-06-01) Nunca responde rápido`)
    expect(input).toContain('42 mensajes')
    expect(input).toContain('Aaron: hola')
  })
})

describe('parseContradictionFindings', () => {
  const refs = new Set([0, 1])

  it('parsea findings válidos', () => {
    const raw = JSON.stringify({
      findings: [{ noteRef: 0, observation: 'habla de su novio', quote: 'mi novio y yo', confidence: 'alta' }],
    })
    const out = parseContradictionFindings(raw, refs)
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ noteRef: 0, observation: 'habla de su novio', quote: 'mi novio y yo', confidence: 'alta' })
  })

  it('tolera cercas de markdown y prosa alrededor', () => {
    const raw = 'Acá está:\n```json\n{"findings":[{"noteRef":1,"observation":"responde en minutos","quote":"jaja sí"}]}\n```\nlisto'
    const out = parseContradictionFindings(raw, refs)
    expect(out).toHaveLength(1)
    expect(out[0].confidence).toBe('media') // default cuando falta/!= 'alta'
  })

  it('descarta refs fuera de rango', () => {
    const raw = JSON.stringify({ findings: [{ noteRef: 9, observation: 'x', quote: 'y' }] })
    expect(parseContradictionFindings(raw, refs)).toEqual([])
  })

  it('descarta findings sin cita o sin observación', () => {
    const raw = JSON.stringify({
      findings: [
        { noteRef: 0, observation: 'sin cita', quote: '' },
        { noteRef: 1, observation: '', quote: 'sin obs' },
      ],
    })
    expect(parseContradictionFindings(raw, refs)).toEqual([])
  })

  it('lista vacía es válida', () => {
    expect(parseContradictionFindings('{"findings":[]}', refs)).toEqual([])
  })

  it('JSON inválido → vacío, no tira', () => {
    expect(parseContradictionFindings('no soy json', refs)).toEqual([])
    expect(parseContradictionFindings('', refs)).toEqual([])
  })
})
