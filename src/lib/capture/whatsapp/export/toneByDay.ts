// SIR V2 — Tono POR DÍA desde los bloques interpretados de un export de WhatsApp.
//
// El LLM infiere un `toneScore` (1-5) por bloque de conversación. Antes el import
// batch aplastaba todo en UN marcador neutro; esto agrupa por día y promedia →
// un log de interacción por día con densidad + variación reales, que alimenta el
// signal de tono (score/Reciprocidad, correlación, predictor del ciclo). PURO.

import type { ChunkInterpretation, ConversationChunk } from './types'

export interface DayTone {
  /** YYYY-MM-DD. */
  day: string
  /** Tono promedio del día (1-5, entero). Nunca 3 (los neutros se saltan). */
  tone: number
  /** Etiqueta corta (primer topic del día, legible). */
  label: string
}

/**
 * Agrupa el toneScore de los bloques por día (usa lastISO del bloque, fallback
 * firstISO), promedia y redondea. `parts[i]` corresponde a `chunks[i]` (los null
 * se saltan). Se OMITEN los días con tono neutro (3): es el hedge del modelo y
 * re-diluiría el promedio — consistente con el import interactivo.
 */
export function groupChunkTonesByDay(
  parts: (ChunkInterpretation | null)[],
  chunks: ConversationChunk[],
): DayTone[] {
  const byDay = new Map<string, { sum: number; n: number; label: string }>()
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part || typeof part.toneScore !== 'number' || part.toneScore < 1 || part.toneScore > 5) continue
    const iso = chunks[i]?.lastISO ?? chunks[i]?.firstISO
    if (!iso) continue
    const day = iso.slice(0, 10)
    const cur = byDay.get(day) ?? { sum: 0, n: 0, label: (part.topics?.[0] ?? '').replace(/_/g, ' ').slice(0, 40) }
    cur.sum += part.toneScore
    cur.n += 1
    byDay.set(day, cur)
  }
  const out: DayTone[] = []
  for (const [day, agg] of byDay) {
    const tone = Math.round(agg.sum / agg.n)
    if (tone === 3) continue
    out.push({ day, tone, label: agg.label })
  }
  return out
}
