// SIR V2 — Inferencia de ciclo desde una observación de WhatsApp por SCREENSHOT.
//
// El import por archivo (.txt/.zip) ya infiere el ciclo (runImport → cycleSignals).
// Pero muchas menciones llegan como CAPTURA de pantalla (caso Nicolle: "me vino el
// 25 de junio" en un screenshot). Esas van por el pipeline de Visión, que deja
// `data.rawMessages` (author 'user'|'other' + content) + `conversationDate`.
// Acá reusamos EL MISMO extractor sobre esos mensajes. PURO.

import { extractCycleSignals } from '@/lib/capture/whatsapp/export/cycleSignals'
import type { ExportMessage } from '@/lib/capture/whatsapp/export/types'

const IDENTITY_ROLES = new Map<string, 'user' | 'other'>([['user', 'user'], ['other', 'other']])

export interface InferredCycle {
  date: string
  phase: 'bleeding' | 'pms'
  matched: string
}

/**
 * Infiere señales de ciclo de la `data` de una observación whatsapp por
 * screenshot. Usa `conversationDate` como fecha de referencia; si no hay,
 * `fallbackToday` — pero en ese caso descarta las señales de "estado ahora"
 * (fechadas al fallback) para no inventar la fecha, conservando solo las de
 * FECHA EXPLÍCITA en el texto ("me vino el 25 de junio"). PURA.
 */
export function inferCyclesFromWhatsappData(data: unknown, fallbackToday: string): InferredCycle[] {
  const d = (data ?? {}) as Record<string, unknown>
  const raw = Array.isArray(d.rawMessages) ? d.rawMessages
    : Array.isArray(d.messages) ? d.messages
    : []
  const convRaw = typeof d.conversationDate === 'string' ? d.conversationDate : ''
  const conv = /^\d{4}-\d{2}-\d{2}/.test(convRaw) ? convRaw.slice(0, 10) : null
  const refDate = conv ?? fallbackToday
  const iso = `${refDate}T12:00:00-05:00`

  const msgs: ExportMessage[] = raw.map((m) => {
    const r = (m ?? {}) as Record<string, unknown>
    return {
      iso, time: '12:00',
      author: r.author === 'user' ? 'user' : 'other',
      content: typeof r.content === 'string' ? r.content : typeof r.text === 'string' ? r.text : '',
      isMedia: false,
    }
  })

  return extractCycleSignals(msgs, IDENTITY_ROLES, null)
    .filter((s) => conv !== null || s.date !== refDate)
    .map((s) => ({ date: s.date, phase: s.phase, matched: s.matched }))
}
