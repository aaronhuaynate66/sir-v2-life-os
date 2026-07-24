// SIR V2 — Ingesta de correo POR MENSAJE (helper reusable de servidor).
//
// Toma correos ya normalizados a GraphMessage (vengan de Graph o del scrape de
// Outlook Web) y los persiste con el MISMO pipeline del SIR Reader: agrupa por
// remitente → un ReaderBatch por persona → ingestReaderBatch (persona por
// remitente, dedup por hash, observación dm_conversation). Idempotente y
// fail-open: si un remitente falla, sigue con el resto.
//
// Lo usan los dos caminos: /api/email/sync (Graph, sesión) y /api/email/ingest
// (scrape de OWA, token). Antes esta lógica estaba inline en sync.

import type { SupabaseClient } from '@supabase/supabase-js'

import { reportApiError } from '@/lib/observability/reportApiError'
import { ingestReaderBatch } from '@/lib/reader/persist'
import type { ReaderBatch } from '@/lib/reader/ingest'
import { messageText, type GraphMessage } from './graph'

/**
 * Llave del hilo/remitente: el email si lo tenemos (lo más estable), si no un
 * slug del nombre visible. Así el scrape de OWA (que a veces solo ve el nombre)
 * agrupa razonablemente sin colapsar todo en un hilo vacío.
 */
export function senderKey(m: GraphMessage): string {
  if (m.fromEmail) return m.fromEmail
  const slug = (m.from || '').toLowerCase().replace(/\s+/g, ' ').trim()
  return slug || 'desconocido'
}

export interface EmailIngestResult {
  ingested: number
  senders: number
}

/**
 * Agrupa `messages` por remitente y los ingiere con ingestReaderBatch. `client`
 * puede ser service-role (token) o de sesión con RLS. Devuelve cuántos mensajes
 * NUEVOS entraron y cuántos remitentes se tocaron.
 */
export async function ingestEmailMessages(
  client: SupabaseClient,
  userId: string,
  messages: GraphMessage[],
  meta: { route: string } = { route: 'email/ingest' },
): Promise<EmailIngestResult> {
  const bySender = new Map<string, { name: string; msgs: GraphMessage[] }>()
  for (const m of messages) {
    const key = senderKey(m)
    const g = bySender.get(key) || { name: m.from || m.fromEmail || key, msgs: [] }
    g.name = m.from || g.name
    g.msgs.push(m)
    bySender.set(key, g)
  }

  let ingested = 0
  for (const [key, g] of bySender) {
    // Email del remitente para atribuir a la persona ANTES que por nombre. El
    // primero que exista en el grupo (todos comparten remitente por senderKey).
    const senderEmail = g.msgs.find((m) => m.fromEmail)?.fromEmail || ''
    const batch: ReaderBatch = {
      platform: 'email',
      threadId: `email:${key}`,
      threadName: g.name,
      senderEmail,
      messages: g.msgs.map((m) => ({ author: m.from || g.name, text: messageText(m), ts: m.receivedAt })),
    }
    try {
      const r = await ingestReaderBatch(client, userId, batch)
      ingested += r.ingested || 0
    } catch (e) {
      reportApiError(e, { route: meta.route, step: 'ingest' })
    }
  }

  return { ingested, senders: bySender.size }
}
