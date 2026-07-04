// SIR V2 — Contexto de conversación de una persona (WhatsApp import).
//
// El import de WhatsApp deja una observación `whatsapp_chat` con summary + temas +
// tono + una muestra de mensajes recientes. Ni /sir/ask ni la Sala de ensayo la
// leían (solo memorias derivadas), por eso SIR "solo veía metadata". Este helper
// trae ese contenido para que SIR pueda RAZONAR sobre la conversación real.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ConvMessage {
  author: 'user' | 'other'
  content: string
  timestamp?: string
}

export interface PersonConversation {
  summary: string
  topics: string[]
  recentMessages: ConvMessage[]
  /** Estado emocional inferido de Aaron / de la otra persona. */
  userState?: string
  otherState?: string
  messageCount?: number
  /** ISO del último mensaje del export. */
  observedAt?: string | null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Trae el contenido de la conversación más reciente importada de una persona
 * (observación whatsapp_chat). null si no hay ninguna.
 */
export async function getPersonConversation(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
): Promise<PersonConversation | null> {
  const { data } = await supabase
    .from('observations')
    .select('data, observed_at')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('capture_type', 'whatsapp_chat')
    .order('observed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const d = (data?.data ?? null) as Record<string, unknown> | null
  if (!d) return null

  const emo = (d.emotionalStates && typeof d.emotionalStates === 'object' ? d.emotionalStates : {}) as Record<string, unknown>
  const rawMessages = Array.isArray(d.rawMessages) ? d.rawMessages : []

  return {
    summary: str(d.summary),
    topics: Array.isArray(d.topics) ? d.topics.filter((t): t is string => typeof t === 'string').slice(0, 20) : [],
    recentMessages: rawMessages
      .map((m) => {
        const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>
        return {
          author: o.author === 'user' ? ('user' as const) : ('other' as const),
          content: str(o.content),
          timestamp: typeof o.timestamp === 'string' ? o.timestamp : undefined,
        }
      })
      .filter((m) => m.content.length > 0)
      .slice(0, 40),
    userState: str(emo.user) || undefined,
    otherState: str(emo.otherPerson) || undefined,
    messageCount: typeof d.messageCount === 'number' ? d.messageCount : undefined,
    observedAt: (data?.observed_at as string) ?? null,
  }
}

/** Renderiza la conversación como bloque de texto para un prompt de LLM. PURO. */
export function renderConversationForPrompt(conv: PersonConversation, personName: string, maxMessages = 30): string {
  const lines: string[] = []
  lines.push(`Conversación reciente importada con ${personName} (${conv.messageCount ?? conv.recentMessages.length} mensajes en total):`)
  if (conv.summary) lines.push(`Resumen: ${conv.summary.slice(0, 1200)}`)
  if (conv.topics.length) lines.push(`Temas: ${conv.topics.slice(0, 12).join(', ')}`)
  if (conv.userState || conv.otherState) {
    lines.push(`Tono: Aaron=${conv.userState ?? '—'}, ${personName}=${conv.otherState ?? '—'}`)
  }
  const msgs = conv.recentMessages.slice(-maxMessages)
  if (msgs.length) {
    lines.push('Muestra de mensajes (los más recientes que se guardaron):')
    for (const m of msgs) {
      lines.push(`  ${m.author === 'user' ? 'Aaron' : personName}: ${m.content.slice(0, 240)}`)
    }
  }
  return lines.join('\n')
}
