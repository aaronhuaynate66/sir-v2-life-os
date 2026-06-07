// SIR V2 — Tests del ensamblado "antes de contactar" (contactBrief).
//
// Dos garantías:
//   1. DETERMINISMO: dada la misma data + `now`, el brief de actividad reciente
//      selecciona/ordena/recorta siempre igual (TZ-independiente).
//   2. PRIVACIDAD: las notas privadas (person_sensitive_data) NUNCA entran a este
//      ensamblado. El serializador lee SÓLO `input.memories`; si una clave
//      sensible se cuela en el input, la ignora (defensa en profundidad, mismo
//      espíritu que el test de buildMessageContext).

import { describe, it, expect } from 'vitest'

import { buildContactBrief, ACTIVITY_RECENT_DAYS, type ContactBriefInput } from './contactBrief'
import type { Memory } from '@/types'

const NOW = new Date('2026-06-07T12:00:00Z')

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 86_400_000).toISOString()
}

function mem(partial: Partial<Memory> & { id: string }): Memory {
  return {
    id: partial.id,
    type: partial.type ?? 'episodic',
    title: partial.title ?? '',
    content: partial.content ?? '',
    entities: partial.entities ?? [],
    emotionalCharge: partial.emotionalCharge ?? 0,
    importance: partial.importance ?? 5,
    timestamp: partial.timestamp ?? daysAgo(1),
    lastAccessed: partial.lastAccessed ?? partial.timestamp ?? daysAgo(1),
    decayRate: partial.decayRate ?? 0.05,
    tags: partial.tags ?? [],
    relatedMemories: partial.relatedMemories ?? [],
    personId: partial.personId,
    source: partial.source,
    sourceEventId: partial.sourceEventId,
  }
}

describe('buildContactBrief — actividad reciente (determinístico)', () => {
  it('surface tags + tiempo relativo de la memoria más reciente', () => {
    const { recentActivity } = buildContactBrief(
      { memories: [mem({ id: 'a', tags: ['comercial', 'jhodaal'], timestamp: daysAgo(4) })] },
      NOW,
    )
    expect(recentActivity).toHaveLength(1)
    expect(recentActivity[0].tags).toEqual(['comercial', 'jhodaal'])
    expect(recentActivity[0].relative).toBe('hace 4d')
    expect(recentActivity[0].days).toBe(4)
  })

  it('ordena por recencia y capa a 2 señales', () => {
    const { recentActivity } = buildContactBrief(
      {
        memories: [
          mem({ id: 'vieja', tags: ['profesional'], timestamp: daysAgo(20) }),
          mem({ id: 'hoy', tags: ['personal'], timestamp: daysAgo(0) }),
          mem({ id: 'media', tags: ['comercial'], timestamp: daysAgo(5) }),
        ],
      },
      NOW,
    )
    expect(recentActivity).toHaveLength(2)
    expect(recentActivity[0].tags).toEqual(['personal'])
    expect(recentActivity[1].tags).toEqual(['comercial'])
  })

  it('excluye memorias fuera de la ventana de recencia', () => {
    const { recentActivity } = buildContactBrief(
      { memories: [mem({ id: 'a', tags: ['comercial'], timestamp: daysAgo(ACTIVITY_RECENT_DAYS + 5) })] },
      NOW,
    )
    expect(recentActivity).toHaveLength(0)
  })

  it('excluye memorias marcadas como viejas/obsoletas aunque caigan en la ventana', () => {
    const { recentActivity } = buildContactBrief(
      {
        memories: [
          mem({ id: 'stale', tags: ['comercial', 'histórico'], timestamp: daysAgo(2) }),
          mem({ id: 'obs', tags: ['profesional', 'obsoleto'], timestamp: daysAgo(1) }),
        ],
      },
      NOW,
    )
    expect(recentActivity).toHaveLength(0)
  })

  it('deduplica tags (sin acentos / case) y los capa a 4', () => {
    const { recentActivity } = buildContactBrief(
      {
        memories: [
          mem({
            id: 'a',
            tags: ['Comercial', 'comercial', 'próximo_paso', 'objeción', 'riesgo', 'reciprocidad'],
            timestamp: daysAgo(1),
          }),
        ],
      },
      NOW,
    )
    expect(recentActivity[0].tags).toEqual(['Comercial', 'próximo_paso', 'objeción', 'riesgo'])
  })

  it('fallback a snippet del título cuando no hay tags útiles', () => {
    const { recentActivity } = buildContactBrief(
      { memories: [mem({ id: 'a', tags: [], title: 'Quedaron en cerrar la propuesta el lunes', timestamp: daysAgo(3) })] },
      NOW,
    )
    expect(recentActivity[0].tags).toEqual([])
    expect(recentActivity[0].snippet).toBe('Quedaron en cerrar la propuesta el lunes')
  })

  it('descarta una memoria sin tags útiles ni texto', () => {
    const { recentActivity } = buildContactBrief(
      { memories: [mem({ id: 'a', tags: [], title: '', content: '', timestamp: daysAgo(1) })] },
      NOW,
    )
    expect(recentActivity).toHaveLength(0)
  })

  it('sin memorias → sin actividad (degradá con gracia)', () => {
    expect(buildContactBrief({ memories: [] }, NOW).recentActivity).toEqual([])
  })

  it('ignora memorias con timestamp inválido', () => {
    const { recentActivity } = buildContactBrief(
      { memories: [mem({ id: 'a', tags: ['comercial'], timestamp: 'no-es-fecha' })] },
      NOW,
    )
    expect(recentActivity).toHaveLength(0)
  })
})

describe('buildContactBrief — las notas privadas NUNCA entran al ensamblado', () => {
  const SENTINEL = '__NOTA_PRIVADA_ULTRA_SECRETA_no_debe_ir_a_la_IA__'

  it('el brief no acepta ni emite notas privadas: la clave colada se ignora', () => {
    // Defensa en profundidad: si alguien spread-ea el DTO sensible dentro del
    // input (bug futuro), buildContactBrief lee SÓLO `memories` y nunca emite la
    // nota privada. El brief NO es un payload de IA (es 100% client-side y
    // determinístico), pero blindamos el contrato igual.
    const contaminated = {
      memories: [mem({ id: 'a', tags: ['comercial'], timestamp: daysAgo(1) })],
      privateNotes: SENTINEL,
    } as unknown as ContactBriefInput

    const brief = buildContactBrief(contaminated, NOW)
    expect(JSON.stringify(brief)).not.toContain(SENTINEL)
    expect(JSON.stringify(brief)).not.toMatch(/nota[s]?\s+privada/i)
  })
})
