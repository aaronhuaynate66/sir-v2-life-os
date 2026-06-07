// SIR V2 — "Antes de contactar": ensamblado de la actividad reciente para la
// cabecera de la ficha (lógica pura, DETERMINÍSTICA, `now` inyectable).
//
// La franja de resumen (ResumenPersona / buildPersonSummary) ya cubre estado del
// vínculo: score, última interacción, próxima fecha de la red y ciclo. Lo que
// FALTA para "estar listo para escribirle" es lo último concreto que pasó con la
// persona — la actividad reciente que aparece en sus MEMORIAS derivadas (tags
// estructurados como `comercial`, `próximo_paso`, + tags libres como nombres de
// cuenta: "jhodaal"). Esto reusa el mismo material que alimenta el panel de
// alineación (memorias derivadas + marcas de recencia), pero SIN scope de
// objetivo: acá sólo queremos "lo más reciente y relevante, de un vistazo".
//
// PRIVACIDAD: este ensamblado NO conoce las notas privadas
// (person_sensitive_data.private_notes). Su única entrada es `memories` (datos
// públicos que ya viajan a IA por otros caminos). Las notas privadas se renderizan
// aparte, client-side y verbatim, y NUNCA pasan por acá ni por ningún prompt. El
// serializador lee SÓLO `input.memories`: si alguien spread-ea un DTO sensible en
// el input (bug futuro), las claves desconocidas se ignoran (defensa en
// profundidad, igual que buildMessageContext).

import type { Memory } from '@/types'
import { relativeEs } from '@/lib/graph/hover'

const DAY_MS = 86_400_000

/** Ventana (días) para considerar una memoria "actividad reciente". Más allá de
 *  esto ya no es lo que tenés presente al abrir la ficha para escribirle. */
export const ACTIVITY_RECENT_DAYS = 60

/** Máximo de señales recientes a mostrar (compacto, no abrumar). */
const MAX_SIGNALS = 2

/** Máximo de tags por señal (legibilidad de una línea). */
const MAX_TAGS_PER_SIGNAL = 4

/** Marcas de recencia que la derivación pone a lo viejo/no vigente. Una memoria
 *  marcada así NO es actividad reciente, aunque caiga dentro de la ventana. */
const STALE_TAGS = new Set(['historico', 'obsoleto'])

/** Normaliza un tag: minúsculas, sin acentos, sólo alfanumérico. */
function normalizeTag(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

export interface RecentActivitySignal {
  /** Tags legibles (originales, con acentos), deduplicados y capados. */
  tags: string[]
  /** Snippet de una línea (fallback cuando la memoria no tiene tags útiles). */
  snippet?: string
  /** Tiempo relativo en español ("hace 4d", "ayer", "recién"). */
  relative: string
  /** Días enteros desde la memoria. */
  days: number
}

export interface ContactBrief {
  /** Lo último concreto que pasó con la persona (0–2 señales). Vacío = nada
   *  reciente que mostrar (degradá con gracia: no muestres la sección). */
  recentActivity: RecentActivitySignal[]
}

export interface ContactBriefInput {
  /** Memorias de la persona (ya scoped a la persona + is_obsolete=false por la
   *  capa de fetch). Es la ÚNICA fuente del brief — datos públicos. */
  memories: Memory[]
}

/** Tags mostrables de una memoria: excluye marcas de recencia y vacíos,
 *  deduplica por forma normalizada y capa. Conserva el tag ORIGINAL. */
function displayTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of tags) {
    const norm = normalizeTag(tag)
    if (!norm || STALE_TAGS.has(norm) || seen.has(norm)) continue
    seen.add(norm)
    out.push(tag.trim())
    if (out.length >= MAX_TAGS_PER_SIGNAL) break
  }
  return out
}

/** ¿La memoria está marcada como vieja/no vigente por la derivación? */
function isStale(m: Memory): boolean {
  return m.tags.some((t) => STALE_TAGS.has(normalizeTag(t)))
}

/** Recorta a un snippet de una línea. */
function snippet(s: string | undefined, max = 80): string | undefined {
  if (!s) return undefined
  const t = s.trim().replace(/\s+/g, ' ')
  if (!t) return undefined
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

/**
 * Ensambla la actividad reciente para la cabecera "antes de contactar".
 * PURO + determinístico (`now` inyectable). Lee SÓLO `input.memories`.
 */
export function buildContactBrief(
  input: ContactBriefInput,
  now: Date = new Date(),
): ContactBrief {
  const nowMs = now.getTime()

  const candidates = (input.memories ?? [])
    .map((m) => {
      const t = Date.parse(m.timestamp)
      return { m, ms: Number.isFinite(t) ? t : NaN }
    })
    .filter(({ ms }) => Number.isFinite(ms))
    .map(({ m, ms }) => ({ m, days: Math.max(0, Math.floor((nowMs - ms) / DAY_MS)) }))
    .filter(({ m, days }) => days <= ACTIVITY_RECENT_DAYS && !isStale(m))
    .sort((a, b) => a.days - b.days)

  const recentActivity: RecentActivitySignal[] = []
  for (const { m, days } of candidates) {
    const tags = displayTags(m.tags)
    // Fallback honesto: sin tags útiles, mostramos un snippet del título/contenido
    // (datos públicos de la memoria). Si tampoco hay texto, descartamos la señal.
    const snip = tags.length === 0 ? snippet(m.title || m.content) : undefined
    if (tags.length === 0 && !snip) continue
    recentActivity.push({ tags, snippet: snip, relative: relativeEs(m.timestamp, now), days })
    if (recentActivity.length >= MAX_SIGNALS) break
  }

  return { recentActivity }
}
