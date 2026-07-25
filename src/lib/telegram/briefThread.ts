// SIR V2 — El brief de la mañana como HILO por secciones (Telegram). PURO.
//
// POR QUÉ: el brief llegaba como UN párrafo con todas las señales pegadas con
// " · ". Aaron (2026-07-25): «así en el formato en que me pasa todo junto no
// siento que me ayude… no se le puede responder a todo de golpe». Eligió el
// formato de HILO: un mensaje corto por tema, cada uno respondible por separado
// (puede citar el mensaje de "tu gente" y seguir ESE hilo).
//
// Reemplaza a formatMorningBriefForChat (un solo bloque) en el canal Telegram.
// El push del navegador NO cambia: sigue usando push.body.

import { topicKey, type MorningSignal, type BriefSection } from '@/lib/push/morning'

/** Un botón del hilo. Mismo shape que InlineButton del cliente de Telegram. */
export interface BriefButton { text: string; callbackData: string }

export interface BriefMessage {
  section: BriefSection
  /** Texto listo para enviar (texto plano; Telegram no renderiza markdown acá). */
  text: string
  /** Filas de botones. [] cuando ninguna señal de la sección admite acción. */
  buttons: BriefButton[][]
}

/** Acciones que un botón del brief puede disparar. El webhook las rutea. */
export type BriefActionKind = 'task_done' | 'task_remind' | 'person_draft' | 'moment_close' | 'goal_next' | 'mute'

export const BRIEF_CALLBACK_PREFIX = 'br|'
/** Telegram corta callback_data en 64 bytes. */
const MAX_CALLBACK = 64

/** `br|<accion>|<ref>`. PURO. '' si no cabe (el caller omite ese botón). */
export function briefCallbackData(kind: BriefActionKind, ref: string): string {
  const data = `${BRIEF_CALLBACK_PREFIX}${kind}|${ref}`
  return Buffer.byteLength(data, 'utf8') <= MAX_CALLBACK ? data : ''
}

/** Parsea el callback de un botón del brief. null si no es uno. PURO. */
export function parseBriefCallback(data: string): { kind: BriefActionKind; ref: string } | null {
  if (!data || !data.startsWith(BRIEF_CALLBACK_PREFIX)) return null
  const rest = data.slice(BRIEF_CALLBACK_PREFIX.length)
  const sep = rest.indexOf('|')
  if (sep <= 0) return null
  const kind = rest.slice(0, sep) as BriefActionKind
  const ref = rest.slice(sep + 1)
  const known: BriefActionKind[] = ['task_done', 'task_remind', 'person_draft', 'moment_close', 'goal_next', 'mute']
  if (!known.includes(kind) || !ref) return null
  return { kind, ref }
}

/** Referencia corta y estable de un tema, para el 🔕 (el topicKey completo no
 *  entra en 64 bytes). PURA y determinística. */
export function muteRef(text: string): string {
  const key = topicKey(text)
  let h = 0
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Slots cuyo contenido puede repetirse mañana tras mañana sin cambiar (por
 *  prioridad de "qué es lo que más cansa oír"). Solo estos ofrecen 🔕. */
const MUTABLE_SLOTS = ['momentResolution', 'relationshipNudge', 'cycleWeekAhead', 'goalNudge', 'weekFocus', 'healthWatch', 'habitNudge'] as const

/**
 * Botones de una sección, derivados de lo que las señales SABEN. Una señal sin
 * entidad no genera botón de acción (nada de botones que no hacen nada), pero
 * las de "tu gente" siempre pueden callarse. PURO.
 */
export function buildSectionButtons(signals: MorningSignal[]): BriefButton[][] {
  const rows: BriefButton[][] = []
  const push = (...btns: Array<BriefButton | null>) => {
    const row = btns.filter((b): b is BriefButton => !!b && !!b.callbackData)
    if (row.length) rows.push(row)
  }
  const btn = (text: string, kind: BriefActionKind, ref: string): BriefButton | null => {
    const callbackData = briefCallbackData(kind, ref)
    return callbackData ? { text, callbackData } : null
  }

  for (const s of signals) {
    const e = s.entity
    if (e?.kind === 'task' && s.slot === 'dueTask') {
      push(btn('✅ Ya lo hice', 'task_done', e.id), btn('⏰ Recuérdamelo 6pm', 'task_remind', e.id))
    } else if (e?.kind === 'person' && s.slot === 'relationshipNudge') {
      const first = (e.name ?? '').split(/\s+/)[0]
      push(btn(first ? `✍️ Escríbele a ${first}` : '✍️ Escríbele', 'person_draft', e.id))
    } else if (e?.kind === 'moment') {
      push(btn('✅ Dar por cerrado', 'moment_close', e.id))
    } else if (e?.kind === 'goal') {
      push(btn('🚀 Dame el próximo paso', 'goal_next', e.id))
    }
  }

  // 🔕 solo para señales REPETIBLES: las que describen un estado que puede durar
  // semanas y volver cada mañana. Una tarea con fecha o un cumpleaños se resuelven
  // solos — ofrecer callarlos sería ruido. Uno por mensaje: más botones, más ruido.
  const mutable = MUTABLE_SLOTS.map((slot) => signals.find((s) => s.slot === slot)).find(Boolean)
  if (mutable) push(btn('🔕 No me lo repitas', 'mute', muteRef(mutable.text)))
  return rows
}

const SECTION_META: Record<BriefSection, { emoji: string; title: string; order: number }> = {
  hoy: { emoji: '⚡', title: 'HOY', order: 0 },
  gente: { emoji: '💚', title: 'TU GENTE', order: 1 },
  metas: { emoji: '🎯', title: 'TUS METAS', order: 2 },
}

const GREETING = '🌿 Buen día, Aaron.'
const CLOSING = 'Responde a cualquiera de estos mensajes y seguimos por ahí 💬'

/** Una línea del cuerpo: viñeta si hay varias, texto pelado si es una sola. */
function renderLines(texts: string[]): string {
  if (texts.length === 1) return texts[0]
  return texts.map((t) => `· ${t}`).join('\n')
}

/**
 * Parte las señales en un mensaje por sección (orden: hoy → gente → metas).
 * Las secciones vacías no generan mensaje. El saludo va en el primero y la
 * invitación a responder en el último, para que el hilo no se sienta robótico.
 * Si no hay ninguna señal devuelve [] (el caller decide si manda el mensaje
 * calmo de "no hay nada urgente").
 */
export function buildBriefThread(signals: MorningSignal[]): BriefMessage[] {
  const bySection = new Map<BriefSection, MorningSignal[]>()
  for (const s of signals) {
    if (!s?.text) continue
    const arr = bySection.get(s.section) ?? []
    arr.push(s)
    bySection.set(s.section, arr)
  }

  const sections = ([...bySection.keys()] as BriefSection[])
    .sort((a, b) => SECTION_META[a].order - SECTION_META[b].order)
  if (sections.length === 0) return []

  return sections.map((section, i) => {
    const meta = SECTION_META[section]
    const head = i === 0 ? `${GREETING}\n\n` : ''
    const tail = i === sections.length - 1 ? `\n\n${CLOSING}` : ''
    const mine = signals.filter((s) => s.section === section && s.text)
    const body = renderLines(mine.map((s) => s.text))
    return {
      section,
      text: `${head}${meta.emoji} ${meta.title}\n\n${body}${tail}`,
      buttons: buildSectionButtons(mine),
    }
  })
}
