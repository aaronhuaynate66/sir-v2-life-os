// SIR V2 — Consolidación de las interpretaciones por bloque en UNA lectura
// + armado del `data` de la observación whatsapp_chat. PURO + testeable.
//
// Cada bloque dio un ChunkInterpretation (resumen, topics, tono, fechas,
// hechos). Acá los unimos en un solo ConsolidatedExport y construimos el objeto
// `data` que se persiste como UNA observación whatsapp_chat — la MISMA shape
// que ya alimenta "Lo personal" (person-synthesis lee summary/topics/
// emotionalStates), la recencia/Fuerza (conversationDate), las memorias
// (deriveFromObservations lee summary+topics) y la bitácora.

import type {
  ChunkInterpretation,
  ConsolidatedExport,
  ExtractedDate,
  ParsedExport,
  ExportMessage,
} from './types'

// ─── helpers de merge ───────────────────────────────────────────────

function normName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Estado emocional dominante (más frecuente) entre los bloques. */
function dominant(values: (string | null)[]): string | null {
  const counts = new Map<string, number>()
  for (const v of values) {
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k
      bestN = n
    }
  }
  return best
}

function unionStrings(lists: string[][], cap: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const s of list) {
      const key = s.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(s)
      if (out.length >= cap) return out
    }
  }
  return out
}

/** Normaliza el label de un evento recurrente para reconciliar variantes del
 *  MISMO evento: saca paréntesis ("(30 años)"), cantidades de años y espacios.
 *  Así "Cumpleaños de Nicolle (30 años)" y "Cumpleaños de Nicolle" colapsan en
 *  uno (gana el primero, cronológico). */
function normRecurringLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\d+\s*a[nñ]os?/g, '')
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function dedupDates(lists: ExtractedDate[][], cap: number): ExtractedDate[] {
  const seen = new Set<string>()
  const out: ExtractedDate[] = []
  for (const list of lists) {
    for (const d of list) {
      // Solo fechas del CONTACTO se adjuntan a la ficha. Las explícitamente
      // marcadas del usuario ('self', ej. "tu cumpleaños") o de terceros
      // ('tercero', ej. "cumple de tata") se descartan. Ausente = legacy → se
      // mantiene (no perdemos data vieja sin subject).
      if (d.subject === 'self' || d.subject === 'tercero') continue
      // Recurring (cumpleaños/aniversario) → dedupe por LABEL solo: reconcilia
      // entradas contradictorias del mismo evento (ej. dos "cumpleaños de X" con
      // meses distintos) en una sola (gana la primera, cronológica).
      const key = d.recurring
        ? `recurring|${normRecurringLabel(d.label)}`
        : `${d.label.toLowerCase()}|${d.dateISO ?? d.rawText.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(d)
      if (out.length >= cap) return out
    }
  }
  return out
}

const MAX_SUMMARY_CHARS = 1200

/**
 * Resumen consolidado priorizando lo RECIENTE: une los bloques en orden
 * cronológico, pero si exceden el presupuesto conserva los del FINAL (los más
 * nuevos) y antepone una marca de que hubo conversación previa. PURO.
 */
export function recencyFirstSummary(blockSummaries: string[], maxChars: number): string {
  const joined = blockSummaries.join(' ')
  if (joined.length <= maxChars) return joined

  // Tomar bloques desde el final (recientes) hasta llenar el presupuesto.
  const marker = '…[conversación previa] '
  const budget = Math.max(1, maxChars - marker.length)
  const kept: string[] = []
  let len = 0
  for (let i = blockSummaries.length - 1; i >= 0; i--) {
    const s = blockSummaries[i]
    if (kept.length > 0 && len + s.length + 1 > budget) break
    kept.unshift(s)
    len += s.length + 1
  }
  let body = kept.join(' ')
  // Borde: un único bloque gigante → quedarnos con su cola (lo más reciente).
  if (body.length > budget) body = body.slice(body.length - budget).trimStart()
  return `${marker}${body}`
}

/**
 * Une las interpretaciones de los bloques (en orden cronológico) en una sola
 * lectura consolidada. Bloques vacíos/sin contenido se ignoran.
 */
export function consolidateInterpretations(parts: ChunkInterpretation[]): ConsolidatedExport {
  const valid = parts.filter((p) => p && (p.summary || p.topics.length > 0))

  const blockSummaries = valid.map((p) => p.summary).filter((s) => s.length > 0)
  // Narrativa consolidada: secuencia de los resúmenes de bloque (orden = tiempo).
  // PESO POR RECENCIA: si no entra todo, conservamos los bloques MÁS RECIENTES
  // (la cola) y marcamos que hubo conversación previa. (Antes truncábamos desde
  // el final, dejando solo lo VIEJO → bug Dayana: la síntesis quedaba anclada en
  // la dinámica antigua. Los bloques completos viven igual en blockSummaries.)
  const summary = recencyFirstSummary(blockSummaries, MAX_SUMMARY_CHARS)

  const topics = unionStrings(valid.map((p) => p.topics), 20)
  const emotionalUser = dominant(valid.map((p) => p.emotionalUser))
  const emotionalOther = dominant(valid.map((p) => p.emotionalOther))

  const tones = valid.map((p) => p.toneScore).filter((n) => Number.isFinite(n))
  const avgTone = tones.length > 0 ? tones.reduce((a, b) => a + b, 0) / tones.length : 3
  const interactionQuality = Math.max(1, Math.min(5, Math.round(avgTone)))
  const emotionalTone = Math.max(-1, Math.min(1, (avgTone - 3) / 2))

  const dates = dedupDates(valid.map((p) => p.dates), 20)
  const events = unionStrings(valid.map((p) => p.events), 20)
  const facts = unionStrings(valid.map((p) => p.facts), 30)

  return {
    summary,
    topics,
    emotionalUser,
    emotionalOther,
    interactionQuality,
    emotionalTone,
    dates,
    events,
    facts,
    blockSummaries,
    // El export es texto fiel (no OCR) → confianza alta si hubo material.
    confidence: valid.length > 0 ? 'high' : 'low',
  }
}

// ─── mapeo de autor → user/other ────────────────────────────────────

/**
 * Decide qué participante es "other" (el contacto) y arma un mapa autor→rol.
 * El contacto es el participante cuyo nombre mejor matchea personName; el resto
 * es "user". Si no hay match claro y hay 2 participantes, el otro es "other".
 */
export function buildAuthorRoleMap(
  participants: string[],
  personName: string,
): Map<string, 'user' | 'other'> {
  const map = new Map<string, 'user' | 'other'>()
  const target = normName(personName)

  let contact: string | null = null
  if (target) {
    // Match exacto primero; luego inclusión en cualquier dirección.
    contact =
      participants.find((p) => normName(p) === target) ??
      participants.find((p) => {
        const n = normName(p)
        return n.length > 0 && (n.includes(target) || target.includes(n))
      }) ??
      null
  }
  // Fallback: 2 participantes y ninguno matcheó → el más frecuente como contacto
  // no lo sabemos acá; marcamos a TODOS como 'other' salvo que identifiquemos al
  // contacto (rawMessages es solo evidencia; el rol no es crítico para síntesis).
  for (const p of participants) {
    if (contact && p === contact) {
      map.set(p, 'other')
    } else if (contact) {
      map.set(p, 'user')
    } else {
      map.set(p, 'other')
    }
  }
  return map
}

const RAW_SAMPLE_SIZE = 25

/**
 * Arma el `data` de la observación whatsapp_chat a partir de la conversación
 * parseada + la lectura consolidada. Incluye una MUESTRA acotada de mensajes
 * recientes (evidencia) mapeados a user/other; el grueso de la señal vive en
 * summary/topics/emotionalStates/blockSummaries (no en miles de rawMessages).
 */
export function buildExportObservationData(
  parsed: ParsedExport,
  consolidated: ConsolidatedExport,
  personName: string,
): Record<string, unknown> {
  const roleMap = buildAuthorRoleMap(parsed.participants, personName)
  const sample: ExportMessage[] = parsed.messages.slice(-RAW_SAMPLE_SIZE)
  const rawMessages = sample.map((m) => ({
    timestamp: m.time,
    author: roleMap.get(m.author) ?? 'other',
    content: m.content.slice(0, 500),
    ...(m.isMedia ? { hasSticker: false } : {}),
  }))

  const range =
    parsed.firstISO && parsed.lastISO
      ? `${parsed.firstISO.slice(0, 10)}–${parsed.lastISO.slice(0, 10)}`
      : 'rango desconocido'
  const rawObservations =
    `Importado del export de WhatsApp · ${parsed.messages.length} mensajes` +
    `${parsed.mediaCount > 0 ? ` (${parsed.mediaCount} de media)` : ''} · ${range}`

  return {
    personName: personName.trim(),
    // observed_at se deriva de conversationDate (último mensaje = recencia real).
    conversationDate: parsed.lastISO,
    summary: consolidated.summary || `Conversación de WhatsApp con ${personName.trim()}.`,
    topics: consolidated.topics,
    emotionalStates: {
      user: consolidated.emotionalUser ?? undefined,
      otherPerson: consolidated.emotionalOther ?? undefined,
    },
    rawMessages,
    confidence: consolidated.confidence,
    rawObservations: rawObservations.slice(0, 240),
    // ─ Extras propios del export (no los toca el sanitizer de screenshot; acá
    //   los persistimos directo vía el endpoint dedicado). Material rico para
    //   síntesis/memorias + trazabilidad.
    source: 'whatsapp_export',
    messageCount: parsed.messages.length,
    mediaCount: parsed.mediaCount,
    dateRange: { first: parsed.firstISO, last: parsed.lastISO },
    participants: parsed.participants,
    blockSummaries: consolidated.blockSummaries,
    facts: consolidated.facts,
    events: consolidated.events,
    extractedDates: consolidated.dates,
    interactionQuality: consolidated.interactionQuality,
    emotionalTone: consolidated.emotionalTone,
  }
}
