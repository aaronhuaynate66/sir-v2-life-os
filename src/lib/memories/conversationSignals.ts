// SIR V2 — Señales de conversación con PESO POR RECENCIA (PURO + testeable).
//
// Problema que resuelve (caso Dayana, verificado en prod): una conversación de
// WhatsApp de miles de mensajes derivó 2 memorias VIEJAS y triviales (un rol de
// hace años, un favor puntual) y la síntesis "Lo personal" quedó anclada en la
// dinámica antigua. El insumo que llega al LLM venía pobre y SIN noción de qué
// es reciente vs histórico.
//
// Este módulo lee la `data` ya consolidada de una observación whatsapp_chat
// (la MISMA que persiste buildExportObservationData) y produce una lectura
// ESTRUCTURADA y PARTIDA POR RECENCIA: el estado ACTUAL (bloques recientes,
// hechos, eventos, fechas próximas) separado del CONTEXTO HISTÓRICO (bloques
// viejos). El derive y la síntesis usan esto para priorizar lo reciente y
// degradar —no borrar— lo viejo.
//
// No llama a ningún modelo ni toca la red: entra `data` cruda + `now`, sale la
// lectura. `now` es inyectable para tests (sin Date.now() implícito).

import type { ExtractedDate } from '@/lib/capture/whatsapp/export/types'

/** Cubeta de recencia de un hecho/fecha respecto de hoy. */
export type RecencyBucket = 'recent' | 'months' | 'old' | 'stale'

const DAY_MS = 86_400_000

/** Umbrales (en días) de las cubetas de recencia. Ajustables en un solo lugar. */
export const RECENCY_THRESHOLDS = {
  /** ≤ 45 días → reciente (estado actual, accionable). */
  recent: 45,
  /** ≤ 180 días → últimos meses (todavía relevante). */
  months: 180,
  /** ≤ 540 días → viejo (contexto, ya no estado actual). */
  old: 540,
  // > 540 días → 'stale' (claramente histórico; degradar fuerte).
} as const

/**
 * Clasifica una fecha ISO respecto de `now` en una cubeta de recencia. Fechas
 * inválidas/ausentes → null. Fechas futuras se tratan como 'recent' (un plan o
 * cumpleaños próximo es lo más actual que hay).
 */
export function classifyRecency(iso: string | null | undefined, now: Date): RecencyBucket | null {
  if (!iso) return null
  const t = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).getTime()
  if (Number.isNaN(t)) return null
  const days = Math.floor((now.getTime() - t) / DAY_MS)
  if (days <= RECENCY_THRESHOLDS.recent) return 'recent'
  if (days <= RECENCY_THRESHOLDS.months) return 'months'
  if (days <= RECENCY_THRESHOLDS.old) return 'old'
  return 'stale'
}

/** Etiqueta legible (español) de una cubeta, para el prompt. */
export function recencyLabel(bucket: RecencyBucket): string {
  switch (bucket) {
    case 'recent':
      return 'reciente'
    case 'months':
      return 'últimos meses'
    case 'old':
      return 'hace tiempo'
    case 'stale':
      return 'antiguo'
  }
}

// ─── Lectura defensiva de la `data` de la observación ────────────────

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
}

function readDates(v: unknown): ExtractedDate[] {
  if (!Array.isArray(v)) return []
  const out: ExtractedDate[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const label = str(o.label)
    if (!label) continue
    out.push({
      label,
      dateISO: typeof o.dateISO === 'string' ? o.dateISO : null,
      rawText: str(o.rawText) ?? '',
      recurring: o.recurring === true,
    })
  }
  return out
}

/** Una fecha extraída + su cubeta de recencia resuelta. */
export interface DatedSignal extends ExtractedDate {
  recency: RecencyBucket | null
}

/**
 * Lectura estructurada y partida por recencia de una conversación. `recent*`
 * es el estado actual; `historical*` es el contexto viejo (no debe dominar).
 */
export interface ConversationSignals {
  /** ISO del primer y último mensaje de la conversación (si se resolvió). */
  firstISO: string | null
  lastISO: string | null
  /** Cubeta de recencia del ÚLTIMO mensaje (qué tan actual es la conversación). */
  overallRecency: RecencyBucket | null
  messageCount: number
  /** Resúmenes de bloque MÁS RECIENTES (cola del export, orden cronológico). */
  recentBlocks: string[]
  /** Resúmenes de bloque más viejos (cabeza del export). Contexto, no estado. */
  historicalBlocks: string[]
  /** Resumen consolidado (puede venir truncado en data vieja). */
  summary: string | null
  topics: string[]
  emotionalUser: string | null
  emotionalOther: string | null
  /** Hechos notables sobre la otra persona (sin fecha propia: se ponderan por
   *  la recencia GLOBAL de la conversación). */
  facts: string[]
  /** Planes/eventos notables sin fecha precisa. */
  events: string[]
  /** Fechas mencionadas con su cubeta de recencia resuelta. */
  dates: DatedSignal[]
}

/**
 * Cuántos bloques del final consideramos "estado reciente". Una conversación
 * larga puede tener decenas de bloques; los últimos N capturan la dinámica
 * vigente sin arrastrar toda la historia.
 */
const RECENT_BLOCK_COUNT = 4

/**
 * Lee la `data` de una observación whatsapp_chat/whatsapp_web y la parte por
 * recencia. Defensivo ante cualquier shape (data es Record<string, unknown>).
 */
export function readConversationSignals(
  data: Record<string, unknown>,
  observedAt: string,
  now: Date,
  recentBlockCount: number = RECENT_BLOCK_COUNT,
): ConversationSignals {
  const dateRange = (data.dateRange && typeof data.dateRange === 'object' ? data.dateRange : {}) as Record<
    string,
    unknown
  >
  const firstISO = str(dateRange.first)
  // Preferimos el último mensaje del rango; si falta, conversationDate; si no, observedAt.
  const lastISO = str(dateRange.last) ?? str(data.conversationDate) ?? str(observedAt)

  const blockSummaries = strArray(data.blockSummaries)
  const n = Math.max(1, recentBlockCount)
  const recentBlocks = blockSummaries.length > n ? blockSummaries.slice(-n) : blockSummaries
  const historicalBlocks = blockSummaries.length > n ? blockSummaries.slice(0, blockSummaries.length - n) : []

  const emo = (data.emotionalStates && typeof data.emotionalStates === 'object'
    ? data.emotionalStates
    : {}) as Record<string, unknown>

  const dates: DatedSignal[] = readDates(data.extractedDates).map((d) => ({
    ...d,
    recency: classifyRecency(d.dateISO, now),
  }))

  const messageCount = typeof data.messageCount === 'number' ? data.messageCount : 0

  return {
    firstISO,
    lastISO,
    overallRecency: classifyRecency(lastISO, now),
    messageCount,
    recentBlocks,
    historicalBlocks,
    summary: str(data.summary),
    topics: strArray(data.topics).slice(0, 20),
    emotionalUser: str(emo.user),
    emotionalOther: str(emo.otherPerson),
    facts: strArray(data.facts).slice(0, 30),
    events: strArray(data.events).slice(0, 20),
    dates,
  }
}

/** ¿La `data` trae material de conversación rico (más allá de summary/topics)? */
export function hasRichConversationData(data: Record<string, unknown>): boolean {
  return (
    strArray(data.blockSummaries).length > 0 ||
    strArray(data.facts).length > 0 ||
    strArray(data.events).length > 0 ||
    (Array.isArray(data.extractedDates) && data.extractedDates.length > 0)
  )
}
