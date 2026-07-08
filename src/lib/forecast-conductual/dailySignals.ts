// SIR V2 — Señales diarias desde los mensajes (§8 del spec). PURO, sin LLM.
//
// Agrupa los mensajes de LA PERSONA (author 'other') por día y arma un vector de
// señales 0..1 (somático/fricción/retiro/sensibilidad/acciones + compuesto). Es
// la serie temporal que alimenta el motor probabilístico. Barato y privado.

import { categoryHits, type SignalCategory } from './lexicon'
import type { ChatMessage, DailySignal } from './types'

function dayKey(at: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}/.test(at)) return at.slice(0, 10)
  const t = Date.parse(at)
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Nº de mensajes del día que matchean ≥1 regex de la categoría. */
function msgsWithCat(texts: string[], cat: SignalCategory): number {
  let n = 0
  for (const t of texts) if (categoryHits(t, cat) > 0) n++
  return n
}
/** Normaliza "N mensajes con la señal" → 0..1 (2+ = señal plena). */
const norm = (hits: number) => Math.max(0, Math.min(1, hits / 2))

// Pesos del compuesto (§8.5). Ajustables por persona vía feedback más adelante.
export const COMPOSITE_WEIGHTS = { somatic: 0.25, friction: 0.25, withdrawal: 0.2, sensitivity: 0.15, actions: 0.15 }

/**
 * Mensajes → señales diarias (solo días con actividad de la persona). PURO.
 * Devuelve ordenado por fecha ascendente.
 */
export function buildDailySignals(messages: ChatMessage[]): DailySignal[] {
  const byDay = new Map<string, string[]>()
  for (const m of messages) {
    if (m.author !== 'other') continue
    if (m.kind && m.kind !== 'text') continue // audios/imgs no aportan texto para el léxico
    const k = dayKey(m.at)
    if (!k) continue
    const arr = byDay.get(k) ?? []
    arr.push(m.text ?? '')
    byDay.set(k, arr)
  }

  const out: DailySignal[] = []
  for (const [date, texts] of byDay) {
    const somatic = norm(msgsWithCat(texts, 'pain') + msgsWithCat(texts, 'medication') + msgsWithCat(texts, 'health') + msgsWithCat(texts, 'sleep'))
    const friction = norm(msgsWithCat(texts, 'friction'))
    const withdrawal = norm(msgsWithCat(texts, 'withdrawal'))
    const sensitivity = norm(msgsWithCat(texts, 'sensitivity'))
    const actions = norm(msgsWithCat(texts, 'actions'))
    const composite =
      COMPOSITE_WEIGHTS.somatic * somatic +
      COMPOSITE_WEIGHTS.friction * friction +
      COMPOSITE_WEIGHTS.withdrawal * withdrawal +
      COMPOSITE_WEIGHTS.sensitivity * sensitivity +
      COMPOSITE_WEIGHTS.actions * actions
    const avgLen = texts.length > 0 ? texts.reduce((s, t) => s + t.length, 0) / texts.length : 0
    out.push({ date, messageCount: texts.length, avgLen, somatic, friction, withdrawal, sensitivity, actions, composite })
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return out
}
