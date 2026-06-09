import { describe, it, expect } from 'vitest'

import {
  consolidateInterpretations,
  buildAuthorRoleMap,
  buildExportObservationData,
  recencyFirstSummary,
} from './consolidate'
import type { ChunkInterpretation, ParsedExport, ExportMessage } from './types'

function interp(over: Partial<ChunkInterpretation>): ChunkInterpretation {
  return {
    summary: '',
    topics: [],
    emotionalUser: null,
    emotionalOther: null,
    toneScore: 3,
    dates: [],
    events: [],
    facts: [],
    ...over,
  }
}

describe('dedupDates — subject + reconciliación de cumpleaños', () => {
  it("descarta fechas de 'self' y 'tercero'; mantiene 'contact' y ausentes", () => {
    const parts = [
      interp({
        summary: 'Charla.',
        dates: [
          { label: 'Cumple de Nicolle', dateISO: '2024-10-03', rawText: 'cumplo 30 en octubre', recurring: true, subject: 'contact' },
          { label: 'Tu cumpleaños', dateISO: '2026-05-09', rawText: 'me regreso pa tu cumpleaños', recurring: true, subject: 'self' },
          { label: 'Cumple de tata', dateISO: null, rawText: 'cumple de tata', recurring: true, subject: 'tercero' },
          { label: 'Viaje a Cusco', dateISO: '2025-07-01', rawText: 'viajo a cusco', recurring: false },
        ],
      }),
    ]
    const c = consolidateInterpretations(parts)
    const labels = c.dates.map((d) => d.label)
    expect(labels).toContain('Cumple de Nicolle')
    expect(labels).toContain('Viaje a Cusco') // subject ausente = legacy, se mantiene
    expect(labels).not.toContain('Tu cumpleaños') // self
    expect(labels).not.toContain('Cumple de tata') // tercero
  })

  it('reconcilia cumpleaños recurring contradictorios del mismo label en uno', () => {
    const parts = [
      interp({ summary: 'a', dates: [{ label: 'Cumpleaños de Nicolle', dateISO: '2024-10-03', rawText: 'en octubre', recurring: true, subject: 'contact' }] }),
      interp({ summary: 'b', dates: [{ label: 'Cumpleaños de Nicolle', dateISO: '2025-05-01', rawText: 'mayo', recurring: true, subject: 'contact' }] }),
    ]
    const c = consolidateInterpretations(parts)
    expect(c.dates.filter((d) => d.label.toLowerCase() === 'cumpleaños de nicolle')).toHaveLength(1)
  })
})

describe('consolidateInterpretations', () => {
  it('une resúmenes, topics y elige emoción dominante', () => {
    const parts = [
      interp({ summary: 'Hablaron del finde.', topics: ['plans_weekend', 'family'], emotionalOther: 'warm', toneScore: 4 }),
      interp({ summary: 'Coordinaron un viaje.', topics: ['family', 'travel'], emotionalOther: 'warm', toneScore: 5 }),
      interp({ summary: 'Discutieron por plata.', topics: ['money'], emotionalOther: 'tense', toneScore: 1 }),
    ]
    const c = consolidateInterpretations(parts)
    expect(c.summary).toContain('Hablaron del finde.')
    expect(c.summary).toContain('Coordinaron un viaje.')
    expect(c.topics).toEqual(['plans_weekend', 'family', 'travel', 'money'])
    expect(c.emotionalOther).toBe('warm') // 2 de 3
    expect(c.blockSummaries).toHaveLength(3)
    expect(c.confidence).toBe('high')
  })

  it('promedia el tono a calidad 1-5 y tono [-1,1]', () => {
    const c = consolidateInterpretations([interp({ toneScore: 5, summary: 'x' }), interp({ toneScore: 1, summary: 'y' })])
    expect(c.interactionQuality).toBe(3) // avg 3
    expect(c.emotionalTone).toBe(0)
    const warm = consolidateInterpretations([interp({ toneScore: 5, summary: 'x' }), interp({ toneScore: 5, summary: 'y' })])
    expect(warm.interactionQuality).toBe(5)
    expect(warm.emotionalTone).toBe(1)
  })

  it('deduplica fechas y une eventos/hechos', () => {
    const parts = [
      interp({
        summary: 'a',
        dates: [{ label: 'Cumple de Ana', dateISO: '2024-06-14', rawText: 'mi cumple es el 14', recurring: true }],
        events: ['planean mudarse'],
        facts: ['trabaja en salud'],
      }),
      interp({
        summary: 'b',
        dates: [{ label: 'Cumple de Ana', dateISO: '2024-06-14', rawText: 'otra mención', recurring: true }],
        events: ['planean mudarse', 'quieren un perro'],
        facts: ['trabaja en salud', 'vive en Lima'],
      }),
    ]
    const c = consolidateInterpretations(parts)
    expect(c.dates).toHaveLength(1)
    expect(c.events).toEqual(['planean mudarse', 'quieren un perro'])
    expect(c.facts).toEqual(['trabaja en salud', 'vive en Lima'])
  })

  it('sin partes válidas → confianza baja', () => {
    const c = consolidateInterpretations([])
    expect(c.confidence).toBe('low')
    expect(c.summary).toBe('')
  })

  it('al truncar conserva lo RECIENTE (cola), no lo viejo (bug Dayana)', () => {
    // 1 bloque viejo enorme + 1 reciente corto. El viejo solo NO debe ganar.
    const viejo = 'VIEJO '.repeat(400) // ~2400 chars, supera el presupuesto
    const parts = [
      interp({ summary: viejo, toneScore: 3 }),
      interp({ summary: 'RECIENTE: hablaron de la web de la botica.', toneScore: 4 }),
    ]
    const c = consolidateInterpretations(parts)
    expect(c.summary).toContain('RECIENTE: hablaron de la web de la botica.')
    expect(c.summary.startsWith('…[conversación previa]')).toBe(true)
    // los bloques completos quedan disponibles igual
    expect(c.blockSummaries).toHaveLength(2)
  })
})

describe('recencyFirstSummary', () => {
  it('texto corto → sin cambios', () => {
    expect(recencyFirstSummary(['a', 'b'], 100)).toBe('a b')
  })
  it('texto largo → conserva los bloques finales y marca lo previo', () => {
    const out = recencyFirstSummary(['x'.repeat(60), 'y'.repeat(60), 'nuevo'], 80)
    expect(out).toContain('nuevo')
    expect(out).toContain('…[conversación previa]')
    expect(out).not.toContain('x'.repeat(60))
  })
})

describe('buildAuthorRoleMap', () => {
  it('mapea el contacto a other y el resto a user', () => {
    const map = buildAuthorRoleMap(['Ana Pérez', 'Yo'], 'Ana Pérez')
    expect(map.get('Ana Pérez')).toBe('other')
    expect(map.get('Yo')).toBe('user')
  })

  it('matchea por inclusión parcial del nombre', () => {
    const map = buildAuthorRoleMap(['Ana', 'Carlos'], 'Ana Pérez')
    expect(map.get('Ana')).toBe('other')
    expect(map.get('Carlos')).toBe('user')
  })
})

describe('buildExportObservationData', () => {
  const messages: ExportMessage[] = [
    { iso: '2024-05-12T21:03:11.000Z', time: '21:03', author: 'Ana', content: 'hola', isMedia: false },
    { iso: '2024-05-12T21:04:00.000Z', time: '21:04', author: 'Yo', content: 'buenas', isMedia: false },
  ]
  const parsed: ParsedExport = {
    messages,
    systemLineCount: 1,
    mediaCount: 0,
    format: 'ios',
    participants: ['Ana', 'Yo'],
    firstISO: '2024-05-12T21:03:11.000Z',
    lastISO: '2024-05-12T21:04:00.000Z',
  }

  it('arma data whatsapp_chat con conversationDate = último mensaje', () => {
    const c = consolidateInterpretations([interp({ summary: 'Charla breve.', topics: ['daily_check_in'], toneScore: 4 })])
    const data = buildExportObservationData(parsed, c, 'Ana')
    expect(data.conversationDate).toBe('2024-05-12T21:04:00.000Z')
    expect(data.summary).toBe('Charla breve.')
    expect(data.topics).toEqual(['daily_check_in'])
    expect(data.source).toBe('whatsapp_export')
    expect(data.messageCount).toBe(2)
    // rawMessages: muestra mapeada a user/other.
    const raw = data.rawMessages as Array<{ author: string; content: string }>
    expect(raw).toHaveLength(2)
    expect(raw.find((m) => m.content === 'hola')!.author).toBe('other')
    expect(raw.find((m) => m.content === 'buenas')!.author).toBe('user')
  })
})
