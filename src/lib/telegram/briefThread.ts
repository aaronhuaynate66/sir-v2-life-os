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

import type { MorningSignal, BriefSection } from '@/lib/push/morning'

export interface BriefMessage {
  section: BriefSection
  /** Texto listo para enviar (texto plano; Telegram no renderiza markdown acá). */
  text: string
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
  const bySection = new Map<BriefSection, string[]>()
  for (const s of signals) {
    if (!s?.text) continue
    const arr = bySection.get(s.section) ?? []
    arr.push(s.text)
    bySection.set(s.section, arr)
  }

  const sections = ([...bySection.keys()] as BriefSection[])
    .sort((a, b) => SECTION_META[a].order - SECTION_META[b].order)
  if (sections.length === 0) return []

  return sections.map((section, i) => {
    const meta = SECTION_META[section]
    const head = i === 0 ? `${GREETING}\n\n` : ''
    const tail = i === sections.length - 1 ? `\n\n${CLOSING}` : ''
    const body = renderLines(bySection.get(section) ?? [])
    return { section, text: `${head}${meta.emoji} ${meta.title}\n\n${body}${tail}` }
  })
}
