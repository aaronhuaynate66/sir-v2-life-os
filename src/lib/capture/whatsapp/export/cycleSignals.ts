// SIR V2 — Inferencia PASIVA del ciclo desde el chat de WhatsApp (C4). PURO.
//
// Escanea los mensajes de la CONTACTA (nunca los de Aaron) buscando menciones
// de su ciclo y las convierte en eventos (bleeding | pms) con la fecha correcta.
// Es el modelo PROBABILÍSTICO (siempre confidence='low'): alimenta las anclas
// del forecast y la regularidad; el dato EXACTO (source 'aaron'/'self_report')
// lo pisa cuando llega. NO pregunta nada — solo usa lo que ella ya dijo (respeta
// el guardrail #629). El guardrail de género (solo mujeres) vive server-side en
// /api/person-cycles.
//
// Dos modos de detección:
//   A. Estado en 1ª persona AHORA — "estoy con la regla", "ando con SPM".
//      La fecha del evento es la del mensaje.
//   B. Fecha REPORTADA — "me vino el 25 de junio", o Aaron pregunta "¿cuándo te
//      vino la regla?" y ella responde con una fecha ("el 25", "ayer"). La fecha
//      del evento es la MENCIONADA, no la del mensaje (patrón real: caso Nicolle,
//      responde el 8-jul que le vino el 25-jun).
//
// Precisión > recall: preferimos NO registrar antes que registrar mal.

import type { ExportMessage } from './types'

export interface CycleSignal {
  /** YYYY-MM-DD del EVENTO (mencionado si lo hay, si no el del mensaje). */
  date: string
  /** ISO completo del mensaje que originó la señal. */
  iso: string
  phase: 'bleeding' | 'pms'
  /** Texto literal del match (para nota/auditoría). */
  matched: string
}

/** Baja a minúsculas y saca acentos para matchear robusto (regla/régla, etc.). */
function norm(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// ─── Modo A: estado en 1ª persona (evento = fecha del mensaje) ───────────
const BLEEDING_RES: RegExp[] = [
  /\bme (?:vino|bajo|llego) (?:la regla|el ?periodo|mi (?:regla|periodo|mes))\b/,
  /\b(?:estoy|ando|sigo) con (?:la|mi) regla\b/,
  /\b(?:estoy|ando) con (?:el|mi) periodo\b/,
  /\btengo (?:la|mi) regla\b/,
  /\bestoy (?:menstruando|con mi menstruacion|indispuesta)\b/,
  /\bando indispuesta\b/,
  /\bestoy en (?:mis|esos) dias\b/,
]
const PMS_RES: RegExp[] = [
  /\b(?:tengo|ando con|estoy con|con el)? ?spm\b/,
  /\bsindrome premenstrual\b/,
  /\bestoy premenstrual\b/,
  /\bme va a (?:venir|bajar) (?:la regla|el periodo|pronto)\b/,
  /\bya me va a (?:venir|bajar)\b/,
  /\bpre[ -]?regla\b/,
]
const NEGATION = /\b(?:no|todavia no|aun no|nunca)\s+(?:me|te|le)?\s*$/

// ─── Modo B: fecha reportada ─────────────────────────────────────────────
// "me vino/bajó/llegó ..." — dispara la búsqueda de fecha en el MISMO mensaje.
const REPORTED_ONSET = /\bme (?:vino|bajo|llego)\b/
// Aaron pregunta por el período → la respuesta con fecha es el inicio del período.
const AARON_ASKS_PERIOD = /\b(?:regla|periodo|menstruacion|ciclo|te vino|te bajo|indispuesta)\b/
const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

/**
 * Extrae señales de ciclo de los mensajes de la contacta.
 *
 * @param messages  Mensajes parseados (con iso + autor crudo), EN ORDEN.
 * @param roleMap   author → 'user'|'other'. Solo se consideran los de 'other'.
 * @param sinceISO  Solo mensajes POSTERIORES (para no re-inferir al re-subir).
 */
export function extractCycleSignals(
  messages: ExportMessage[],
  roleMap: Map<string, 'user' | 'other'>,
  sinceISO: string | null = null,
): CycleSignal[] {
  const byDate = new Map<string, CycleSignal>()
  let prevAaronAsked = false // el mensaje 'user' anterior preguntó por el período

  for (const m of messages) {
    const role = roleMap.get(m.author) ?? 'other'
    const text = norm(m.content)

    if (role === 'user') {
      // Rastreamos si Aaron acaba de preguntar por el período (para el Q&A).
      prevAaronAsked = !!text && AARON_ASKS_PERIOD.test(text)
      continue // jamás inferimos de los mensajes de Aaron
    }

    const askedBefore = prevAaronAsked
    prevAaronAsked = false // se consume con el próximo mensaje de ella

    if (!m.iso || m.iso.length < 10) continue
    if (sinceISO && !(m.iso > sinceISO)) continue
    if (!text) continue

    const hit = matchSignal(text, m.iso, askedBefore)
    if (!hit) continue

    const prev = byDate.get(hit.date)
    // bleeding es un estado más definido que pms → gana si compiten el mismo día.
    if (prev && !(hit.phase === 'bleeding' && prev.phase === 'pms')) continue
    byDate.set(hit.date, { date: hit.date, iso: m.iso, phase: hit.phase, matched: hit.matched })
  }

  return [...byDate.values()].sort((a, b) => a.iso.localeCompare(b.iso))
}

interface Hit { phase: 'bleeding' | 'pms'; date: string; matched: string }

function matchSignal(text: string, iso: string, askedBefore: boolean): Hit | null {
  const msgDate = iso.slice(0, 10)

  // Modo B PRIMERO: fecha reportada. Si dijo "me vino/bajó/llegó" o Aaron acaba
  // de preguntar por el período, y hay una fecha en el mensaje → la fecha
  // MENCIONADA es el evento (gana sobre la del mensaje). Una fecha suelta sin
  // ese contexto no dispara.
  const reported = REPORTED_ONSET.test(text) && !isNegatedReported(text)
  if (reported || askedBefore) {
    const d = parseSpanishDate(text, msgDate)
    if (d) return { phase: 'bleeding', date: d, matched: text.slice(0, 60).trim() }
  }

  // Modo A: estado en 1ª persona (incluye "me vino la regla" sin fecha) →
  // evento = fecha del mensaje.
  for (const re of BLEEDING_RES) {
    const m = re.exec(text)
    if (m && !isNegated(text, m.index)) return { phase: 'bleeding', date: msgDate, matched: m[0].trim() }
  }
  for (const re of PMS_RES) {
    const m = re.exec(text)
    if (m) return { phase: 'pms', date: msgDate, matched: m[0].trim() }
  }
  return null
}

/** true si justo antes del match (modo A) hay una negación. */
function isNegated(text: string, matchIndex: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 24), matchIndex)
  return NEGATION.test(before)
}

/** Negación del onset reportado ("todavía no me vino", "aún no me baja"). */
function isNegatedReported(text: string): boolean {
  return /\b(?:no|todavia no|aun no|nunca)\s+me (?:vino|bajo|llego|baja|viene)\b/.test(text)
}

/**
 * Parsea la PRIMERA fecha en español de un texto y la resuelve a YYYY-MM-DD
 * relativa a `refDate` (la del mensaje). Soporta:
 *   - "25 de junio" / "25 de junio de 2026"
 *   - "25/6" / "25-06" / "25/06/2026"
 *   - relativos: "hoy", "ayer", "anteayer"
 * Devuelve null si no hay fecha o si cae en el futuro (una regla no se reporta
 * antes de que pase).
 */
export function parseSpanishDate(text: string, refDate: string): string | null {
  const [ry, rm, rd] = refDate.split('-').map(Number)
  const ref = new Date(ry, rm - 1, rd)

  // Relativos.
  if (/\bhoy\b/.test(text)) return refDate
  if (/\bayer\b/.test(text)) return ymd(addDays(ref, -1))
  if (/\banteayer\b|\bante ayer\b/.test(text)) return ymd(addDays(ref, -2))

  // "25 de junio [de 2026]"
  const mMonth = /\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de(?:l)?\s+(\d{4}))?/.exec(text)
  if (mMonth) {
    const day = Number(mMonth[1])
    const month = MONTHS[mMonth[2]]
    const year = mMonth[3] ? Number(mMonth[3]) : resolveYear(month, day, ref)
    return validYmd(year, month, day, ref)
  }

  // "25/6" | "25-06" | "25/06/2026". Formato día/mes (Perú), no US.
  const mNum = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(text)
  if (mNum) {
    const day = Number(mNum[1])
    const month = Number(mNum[2])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let year = mNum[3] ? Number(mNum[3]) : resolveYear(month, day, ref)
      if (year < 100) year += 2000
      return validYmd(year, month, day, ref)
    }
  }
  return null
}

/** Año probable de un (mes,día) sin año explícito: el más reciente <= ref. */
function resolveYear(month: number, day: number, ref: Date): number {
  const y = ref.getFullYear()
  const cand = new Date(y, month - 1, day)
  return cand.getTime() > ref.getTime() ? y - 1 : y
}

/** Valida el (año,mes,día) y descarta futuros; devuelve YYYY-MM-DD o null. */
function validYmd(year: number, month: number, day: number, ref: Date): string | null {
  const d = new Date(year, month - 1, day)
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null // fecha inexistente
  if (d.getTime() > ref.getTime()) return null // futuro: no es un período ya ocurrido
  // No más de ~1 año atrás (evita fechas de cumpleaños/aniversarios sueltas).
  if ((ref.getTime() - d.getTime()) > 400 * 86_400_000) return null
  return ymd(d)
}

function addDays(base: Date, n: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n)
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
