import { describe, it, expect } from 'vitest'

import { groupChunkTonesByDay } from './toneByDay'
import type { ChunkInterpretation, ConversationChunk } from './types'

function part(toneScore: number, topics: string[] = []): ChunkInterpretation {
  return { summary: '', topics, emotionalUser: null, emotionalOther: null, toneScore, dates: [], events: [], facts: [] }
}
function chunk(lastISO: string | null, firstISO: string | null = lastISO): ConversationChunk {
  return { index: 0, text: '', messageCount: 1, firstISO, lastISO }
}

describe('groupChunkTonesByDay', () => {
  it('un log por día con el promedio del toneScore', () => {
    const parts = [part(4, ['plans']), part(5), part(2)]
    const chunks = [chunk('2026-06-01T10:00:00'), chunk('2026-06-01T22:00:00'), chunk('2026-06-03T09:00:00')]
    const out = groupChunkTonesByDay(parts, chunks)
    expect(out).toEqual([
      { day: '2026-06-01', tone: 5, label: 'plans' }, // (4+5)/2 = 4.5 → 5
      { day: '2026-06-03', tone: 2, label: '' },
    ])
  })

  it('salta los días con tono neutro (3)', () => {
    const parts = [part(3), part(4)]
    const chunks = [chunk('2026-06-01T10:00:00'), chunk('2026-06-02T10:00:00')]
    const out = groupChunkTonesByDay(parts, chunks)
    expect(out.map((d) => d.day)).toEqual(['2026-06-02'])
  })

  it('ignora bloques null, sin fecha o con toneScore fuera de 1-5', () => {
    const parts = [null, part(4), part(9), part(0)]
    const chunks = [chunk('2026-06-01T10:00:00'), chunk(null), chunk('2026-06-02T10:00:00'), chunk('2026-06-03T10:00:00')]
    const out = groupChunkTonesByDay(parts, chunks)
    expect(out).toEqual([]) // el único válido (4) no tiene fecha; el resto se ignora
  })

  it('limpia el label (snake_case → espacios, cap 40)', () => {
    const out = groupChunkTonesByDay([part(5, ['plan_de_viaje'])], [chunk('2026-06-01T10:00:00')])
    expect(out[0].label).toBe('plan de viaje')
  })
})
