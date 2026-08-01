// SIR V2 — "Lo que entró de tu gente": feed PURO de la ingesta ambiental INBOUND.
//
// Síntesis REACTIVA sobre observations existentes: qué gente te ESCRIBIÓ
// recientemente, por qué canal, y qué podría estar esperando respuesta. Es el
// espejo de "Hoy con tu gente" (DailyActionsPanel), que es PROACTIVO (a quién
// SALIR a buscar por silencio/fecha/señal). Acá no proponemos ni rankeamos por
// urgencia relacional: reflejamos lo que LLEGÓ, ordenado por recencia.
//
// PURO y honesto: sin red, sin reloj propio (`now` inyectado), sólo data real.
// La señal "esperando respuesta" se apoya en la DIRECCIÓN del último mensaje del
// sustrato (chat_messages): si el último lo mandó el OTRO, quedó en tu cancha.
// Sin dirección conocida NO la afirmamos (evita el falso "te está esperando").

import { CONVERSATION_CAPTURE_TYPES } from '@/lib/capture/observations/types'

const DAY_MS = 86_400_000
const DEFAULT_WINDOW_DAYS = 14
const DEFAULT_LIMIT = 8
const GIST_MAX = 160

/** Observación inbound normalizada (una fila de `observations`). */
export interface InboundObservationInput {
  personId: string
  captureType: string
  /** `data.platform` del Reader (teams/whatsapp/email/…) si existe. */
  platform?: string | null
  /** `data.summary` — el gist de lo que entró. */
  summary?: string | null
  /** ISO de `observed_at` (cuándo pasó). */
  observedAt: string
}

/** Metadatos mínimos de la persona para la fila (link a la ficha). */
export interface InboundPersonMeta {
  name: string
  slug: string | null
}

/** Muestra de dirección: un mensaje del sustrato (chat_messages). */
export interface InboundDirectionSample {
  personId: string
  /** 'user' = tú; 'other' = la persona. */
  sender: string
  /** ISO de `sent_at`. */
  sentAt: string
}

export type InboundChannelKey =
  | 'whatsapp'
  | 'teams'
  | 'slack'
  | 'email'
  | 'linkedin'
  | 'instagram'
  | 'facebook'
  | 'dm'

export interface InboundFeedItem {
  personId: string
  personName: string
  personSlug: string | null
  /** Clave estable para el ícono/chip en la UI (no inventa paleta). */
  channelKey: InboundChannelKey
  /** Etiqueta legible del canal ("WhatsApp", "Teams", "Correo"…). */
  channelLabel: string
  /** ISO del último inbound de esta persona (observed_at). */
  lastAt: string
  /** Gist corto (data.summary saneado) o null si no hay. */
  gist: string | null
  /** true sólo si el último mensaje CONOCIDO del sustrato lo mandó el OTRO
   *  (quedó en tu cancha). false si lo último fue tuyo o si no hay dirección. */
  awaitingReply: boolean
  /** Cuántos inbound entraron de esta persona en la ventana. */
  entryCount: number
}

const PLATFORM_LABELS: Record<string, { key: InboundChannelKey; label: string }> = {
  teams: { key: 'teams', label: 'Teams' },
  slack: { key: 'slack', label: 'Slack' },
  whatsapp: { key: 'whatsapp', label: 'WhatsApp' },
  email: { key: 'email', label: 'Correo' },
  linkedin: { key: 'linkedin', label: 'LinkedIn' },
  instagram: { key: 'instagram', label: 'Instagram' },
  facebook: { key: 'facebook', label: 'Facebook' },
}

/**
 * Deriva el canal legible: la `platform` del Reader manda (Teams/Slack/Correo…);
 * si no viene, cae al `capture_type` (WhatsApp / Instagram / "Mensaje directo").
 * PURO.
 */
export function channelFor(
  captureType: string,
  platform?: string | null,
): { key: InboundChannelKey; label: string } {
  const p = (platform ?? '').toLowerCase().trim()
  if (p && PLATFORM_LABELS[p]) return PLATFORM_LABELS[p]
  switch (captureType) {
    case 'whatsapp_chat':
    case 'whatsapp_web':
      return { key: 'whatsapp', label: 'WhatsApp' }
    case 'instagram':
      return { key: 'instagram', label: 'Instagram' }
    case 'dm_conversation':
    default:
      return { key: 'dm', label: 'Mensaje directo' }
  }
}

function isConversation(captureType: string): boolean {
  return (CONVERSATION_CAPTURE_TYPES as readonly string[]).includes(captureType)
}

/** Sanea el gist: colapsa espacios, acota, null si queda vacío. */
function cleanGist(summary: string | null | undefined): string | null {
  const s = (summary ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  return s.length > GIST_MAX ? `${s.slice(0, GIST_MAX - 1).trimEnd()}…` : s
}

export interface BuildInboundFeedOptions {
  now: Date
  /** Ventana de recencia. Default 14 días. */
  windowDays?: number
  /** Tope de filas. Default 8. */
  limit?: number
}

/**
 * Arma el feed inbound: agrupa las observaciones de CONVERSACIÓN por persona
 * (últimas `windowDays` días, no obsoletas), toma la más reciente como cabeza,
 * cuenta cuántas entraron, deriva el canal y cruza la dirección del sustrato
 * para la señal "esperando respuesta". Ordena por recencia (más nuevo primero).
 *
 * Sólo incluye personas presentes en `peopleById` (con nombre para la ficha).
 * Vacío = vacío: no fabrica filas.
 */
export function buildInboundFeed(
  observations: InboundObservationInput[],
  peopleById: Map<string, InboundPersonMeta>,
  direction: InboundDirectionSample[],
  opts: BuildInboundFeedOptions,
): InboundFeedItem[] {
  const nowMs = opts.now.getTime()
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS
  const cutoff = nowMs - windowDays * DAY_MS

  // Último emisor conocido por persona (dirección del sustrato).
  const lastSenderByPerson = new Map<string, { sender: string; at: number }>()
  for (const d of direction) {
    const at = Date.parse(d.sentAt)
    if (!Number.isFinite(at)) continue
    const cur = lastSenderByPerson.get(d.personId)
    if (!cur || at > cur.at) lastSenderByPerson.set(d.personId, { sender: d.sender, at })
  }

  // Agrupar por persona: cabeza = inbound más reciente en ventana + conteo.
  const byPerson = new Map<string, { latest: InboundObservationInput; latestMs: number; count: number }>()
  for (const o of observations) {
    if (!o.personId || !isConversation(o.captureType)) continue
    if (!peopleById.has(o.personId)) continue
    const ms = Date.parse(o.observedAt)
    if (!Number.isFinite(ms) || ms < cutoff) continue
    const cur = byPerson.get(o.personId)
    if (!cur) {
      byPerson.set(o.personId, { latest: o, latestMs: ms, count: 1 })
    } else {
      cur.count += 1
      if (ms > cur.latestMs) {
        cur.latest = o
        cur.latestMs = ms
      }
    }
  }

  const items: InboundFeedItem[] = []
  for (const [personId, agg] of byPerson) {
    const meta = peopleById.get(personId)
    if (!meta) continue
    const ch = channelFor(agg.latest.captureType, agg.latest.platform)
    const last = lastSenderByPerson.get(personId)
    items.push({
      personId,
      personName: meta.name,
      personSlug: meta.slug,
      channelKey: ch.key,
      channelLabel: ch.label,
      lastAt: agg.latest.observedAt,
      gist: cleanGist(agg.latest.summary),
      awaitingReply: !!last && last.sender === 'other',
      entryCount: agg.count,
    })
  }

  items.sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt))
  const limit = opts.limit ?? DEFAULT_LIMIT
  return items.slice(0, Math.max(0, limit))
}
