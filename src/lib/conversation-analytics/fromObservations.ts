// SIR V2 — Adapter: observaciones de conversación → stream de mensajes (ConvMsg).
//
// Junta lo que hay de una persona: dm_conversation (reader Teams/DM, texto
// renderizado `[ISO] Autor: contenido`) + whatsapp_chat (rawMessages estructurado).
// Los mensajes PROPIOS de Teams no traen timestamp (Teams no rotula la hora de los
// tuyos) → se interpola con el último timestamp visto (una respuesta ocurre cerca
// del mensaje al que responde). PURO salvo la query.

import type { SupabaseClient } from '@supabase/supabase-js'

import type { ConvMsg } from './analyze'

const RE_TS = /^\[([^\]]+)\]\s*([^:]+?):\s*(.*)$/ // [ISO] Autor: contenido
const RE_PLAIN = /^([^:[\]]+?):\s*(.*)$/ // Autor: contenido (sin hora, p.ej. mensajes propios)

/** Parsea el texto renderizado del reader a mensajes, interpolando horas faltantes. */
export function parseReaderText(text: string): ConvMsg[] {
  const out: Array<{ fromMe: boolean; at: number | null; text: string }> = []
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || /^conversación con /i.test(line)) continue
    let author = '', content = '', at: number | null = null
    const mTs = line.match(RE_TS)
    if (mTs) {
      const t = Date.parse(mTs[1])
      at = Number.isNaN(t) ? null : t
      author = mTs[2].trim(); content = mTs[3].trim()
    } else {
      const mp = line.match(RE_PLAIN)
      if (!mp) continue
      author = mp[1].trim(); content = mp[2].trim()
    }
    if (!content) continue
    out.push({ fromMe: /^yo$/i.test(author), at, text: content })
  }
  // Interpolar horas faltantes: llevar la última hora vista; si el primero no tiene,
  // usar la próxima disponible.
  let last: number | null = null
  for (const m of out) { if (m.at != null) last = m.at; else if (last != null) m.at = last }
  let next: number | null = null
  for (let i = out.length - 1; i >= 0; i--) { if (out[i].at != null) next = out[i].at; else if (next != null) out[i].at = next }
  return out.filter((m): m is ConvMsg => m.at != null)
}

export interface ObsRow { capture_type: string; data: unknown }

/** PURO: convierte filas de observación de conversación en mensajes unificados. */
export function messagesFromRows(rows: ObsRow[]): ConvMsg[] {
  const msgs: ConvMsg[] = []
  for (const o of rows) {
    const d = (o.data ?? {}) as Record<string, unknown>
    if (o.capture_type === 'dm_conversation' && typeof d.text === 'string') {
      msgs.push(...parseReaderText(d.text))
    } else if (o.capture_type === 'whatsapp_chat' && Array.isArray(d.rawMessages)) {
      for (const raw of d.rawMessages) {
        const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
        const content = typeof m.content === 'string' ? m.content.trim() : ''
        // Preferir `iso` (fecha+hora completa); `timestamp` viejo era solo hora
        // ("14:47") → Date.parse = NaN y el Pulso quedaba vacío (BUG-007).
        const ts = typeof m.iso === 'string' ? m.iso : (typeof m.timestamp === 'string' ? m.timestamp : '')
        const t = ts ? Date.parse(ts) : NaN
        if (!content || Number.isNaN(t)) continue
        msgs.push({ fromMe: m.author === 'user', at: t, text: content })
      }
    }
  }
  const seen = new Set<string>()
  return msgs
    .filter((m) => { const k = `${m.at}|${m.text}`; if (seen.has(k)) return false; seen.add(k); return true })
    .sort((a, b) => a.at - b.at)
}

export interface StoredVolumeSeries {
  /** epoch ms del inicio de la primera semana. */
  firstMs: number
  /** conteo total de mensajes por semana consecutiva. */
  weekly: number[]
}

/**
 * Serie de volumen semanal pre-agregada guardada en el whatsapp_chat (backfill
 * del export completo), para tendencia larga sin cargar 70k mensajes. null si no
 * se hizo el backfill de esa persona.
 */
export async function getStoredVolumeSeries(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
): Promise<StoredVolumeSeries | null> {
  const { data } = await supabase
    .from('observations')
    .select('data')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('capture_type', 'whatsapp_chat')
    .eq('is_obsolete', false)
    .order('created_at', { ascending: false })
    .limit(1)
  const d = (data?.[0]?.data ?? {}) as Record<string, unknown>
  const vs = d.volumeSeries as { firstMs?: unknown; weekly?: unknown } | undefined
  if (vs && typeof vs.firstMs === 'number' && Array.isArray(vs.weekly)) {
    const weekly = vs.weekly.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    if (weekly.length >= 3) return { firstMs: vs.firstMs, weekly }
  }
  return null
}

/** Trae y unifica los mensajes de una persona desde sus observaciones de conversación. */
export async function getConversationMessages(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
): Promise<ConvMsg[]> {
  const { data } = await supabase
    .from('observations')
    .select('capture_type, data')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .in('capture_type', ['dm_conversation', 'whatsapp_chat'])
    .eq('is_obsolete', false)
  return messagesFromRows((data ?? []) as ObsRow[])
}
