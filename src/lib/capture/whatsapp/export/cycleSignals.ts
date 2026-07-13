// SIR V2 — Inferencia PASIVA del ciclo desde el chat de WhatsApp (C4). PURO.
//
// Escanea los mensajes de la CONTACTA (nunca los de Aaron) buscando menciones
// en PRIMERA PERSONA de su ciclo — "me vino la regla", "ando con SPM" — y las
// convierte en eventos de ciclo (bleeding | pms) con la fecha del mensaje.
// Es el modelo PROBABILÍSTICO (siempre confidence='low'): alimenta las anclas
// del forecast y la regularidad; el dato EXACTO (source 'aaron'/'self_report')
// lo pisa cuando llega. NO pregunta nada — solo usa lo que ella ya dijo (respeta
// el guardrail #629). El guardrail de género (solo mujeres) vive server-side en
// /api/person-cycles.
//
// Precisión > recall: preferimos NO registrar antes que registrar mal. Por eso
// (1) solo primera persona de la contacta, (2) frases ancladas a menstruación,
// (3) descartamos negaciones ("todavía no me vino" = atraso, no sangrado).

import type { ExportMessage } from './types'

export interface CycleSignal {
  /** YYYY-MM-DD del mensaje. */
  date: string
  /** ISO completo del mensaje (fecha+hora). */
  iso: string
  phase: 'bleeding' | 'pms'
  /** Texto literal del match (para nota/auditoría). */
  matched: string
}

/** Baja a minúsculas y saca acentos para matchear robusto (regla/régla, etc.). */
function norm(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Frases de SANGRADO (está con el período AHORA). Primera persona.
const BLEEDING_RES: RegExp[] = [
  /\bme (?:vino|bajo|llego) (?:la regla|el? ?periodo|mi (?:regla|periodo|mes))/,
  /\b(?:estoy|ando|sigo) con (?:la|mi) regla\b/,
  /\b(?:estoy|ando) con (?:el|mi) periodo\b/,
  /\btengo (?:la|mi) regla\b/,
  /\bestoy (?:menstruando|con mi menstruacion|indispuesta)\b/,
  /\bando indispuesta\b/,
  /\bestoy en (?:mis|esos) dias\b/,
  /\bme llego (?:mi|la) menstruacion\b/,
]

// Frases PRE-MENSTRUALES (SPM / está por venirle). Primera persona.
const PMS_RES: RegExp[] = [
  /\b(?:tengo|ando con|estoy con|con el)? ?spm\b/,
  /\bsindrome premenstrual\b/,
  /\bestoy premenstrual\b/,
  /\bme va a (?:venir|bajar) (?:la regla|el periodo|pronto)\b/,
  /\bya me va a (?:venir|bajar)\b/,
  /\bpre[ -]?regla\b/,
]

// Negaciones que invalidan un sangrado (atraso, no está con la regla).
const NEGATION = /\b(?:no|todavia no|aun no|nunca)\s+(?:me|te|le)?\s*$/

/**
 * Extrae señales de ciclo de los mensajes de la contacta.
 *
 * @param messages  Mensajes parseados del export (con iso + autor crudo).
 * @param roleMap   author → 'user'|'other' (de buildAuthorRoleMap). Solo se
 *                  consideran los de 'other' (la contacta) — jamás los de Aaron.
 * @param sinceISO  Si se pasa, solo mensajes POSTERIORES (para no re-inferir al
 *                  re-subir el chat).
 */
export function extractCycleSignals(
  messages: ExportMessage[],
  roleMap: Map<string, 'user' | 'other'>,
  sinceISO: string | null = null,
): CycleSignal[] {
  // date → señal elegida (bleeding gana sobre pms en el mismo día).
  const byDate = new Map<string, CycleSignal>()

  for (const m of messages) {
    if (!m.iso || m.iso.length < 10) continue
    if (sinceISO && !(m.iso > sinceISO)) continue
    if ((roleMap.get(m.author) ?? 'other') !== 'other') continue // nunca Aaron
    const text = norm(m.content)
    if (!text) continue

    const hit = matchPhase(text)
    if (!hit) continue

    const date = m.iso.slice(0, 10)
    const prev = byDate.get(date)
    // bleeding es un estado más definido que pms → gana si compiten el mismo día.
    if (prev && !(hit.phase === 'bleeding' && prev.phase === 'pms')) continue
    byDate.set(date, { date, iso: m.iso, phase: hit.phase, matched: hit.matched })
  }

  return [...byDate.values()].sort((a, b) => a.iso.localeCompare(b.iso))
}

/** Devuelve la fase + texto del match, o null. Descarta negaciones de sangrado. */
function matchPhase(text: string): { phase: 'bleeding' | 'pms'; matched: string } | null {
  for (const re of BLEEDING_RES) {
    const m = re.exec(text)
    if (m && !isNegated(text, m.index)) return { phase: 'bleeding', matched: m[0].trim() }
  }
  for (const re of PMS_RES) {
    const m = re.exec(text)
    if (m) return { phase: 'pms', matched: m[0].trim() }
  }
  return null
}

/** true si justo antes del match hay una negación ("todavía no me vino…"). */
function isNegated(text: string, matchIndex: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 24), matchIndex)
  return NEGATION.test(before)
}
