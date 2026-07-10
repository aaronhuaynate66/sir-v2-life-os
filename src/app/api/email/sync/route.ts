// SIR V2 — POST /api/email/sync — trae los correos nuevos y los ingiere.
//
// Refresca el token si expiró, corre el DELTA query de Graph (solo lo nuevo desde
// el último sync), agrupa por remitente y manda cada grupo por ingestReaderBatch
// (mismo pipeline del SIR Reader: persona por remitente, dedup por hash,
// observación dm_conversation). Avanza el delta_link. Session-auth.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import {
  GRAPH, tokenEndpoint, tokenBodyForRefresh, isExpired, expiresAtFrom,
  parseGraphMessage, type TokenResponse, type GraphMessage,
} from '@/lib/email/graph'
import { ingestEmailMessages } from '@/lib/email/ingest'
import { graphConfig, siteOrigin } from '@/lib/email/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_PAGES = 5 // tope de páginas por sync (bound de tiempo/costo)
const START_DELTA = `${GRAPH}/me/mailFolders/inbox/messages/delta?$select=from,subject,bodyPreview,receivedDateTime&$top=25`

interface Conn {
  id: string; access_token: string | null; refresh_token: string | null;
  token_expires_at: string | null; delta_link: string | null;
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  const origin = siteOrigin(req as unknown as import('next/server').NextRequest)
  const cfg = graphConfig(origin)
  if (!cfg) return NextResponse.json({ error: 'Correo no configurado (falta la app de Azure)' }, { status: 400 })

  const { data: connRow } = await supabase
    .from('email_connections').select('id, access_token, refresh_token, token_expires_at, delta_link')
    .eq('user_id', userId).eq('provider', 'microsoft').maybeSingle()
  const conn = connRow as Conn | null
  if (!conn) return NextResponse.json({ error: 'No hay cuenta de correo conectada' }, { status: 400 })

  // 1) Refrescar token si hace falta.
  let accessToken = conn.access_token
  if (isExpired(conn.token_expires_at, Date.now())) {
    if (!conn.refresh_token) return NextResponse.json({ error: 'Reconectá el correo (sin refresh token)' }, { status: 400 })
    try {
      const r = await fetch(tokenEndpoint(cfg), {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBodyForRefresh(cfg, conn.refresh_token),
      })
      const tok = (await r.json()) as TokenResponse & { error?: string }
      if (!r.ok || !tok.access_token) return NextResponse.json({ error: 'No se pudo refrescar el token; reconectá' }, { status: 400 })
      accessToken = tok.access_token
      await supabase.from('email_connections').update({
        access_token: tok.access_token,
        refresh_token: tok.refresh_token ?? conn.refresh_token,
        token_expires_at: expiresAtFrom(tok.expires_in, Date.now()),
        updated_at: new Date().toISOString(),
      }).eq('id', conn.id)
    } catch (e) {
      reportApiError(e, { route: 'email/sync', step: 'refresh' })
      return NextResponse.json({ error: 'Falló el refresh del token' }, { status: 502 })
    }
  }
  if (!accessToken) return NextResponse.json({ error: 'Sin token válido' }, { status: 400 })

  // 2) Delta query (incremental). Seguimos nextLink hasta MAX_PAGES o deltaLink.
  const messages: GraphMessage[] = []
  let nextUrl: string | null = conn.delta_link || START_DELTA
  let newDeltaLink: string | null = conn.delta_link
  try {
    for (let page = 0; page < MAX_PAGES && nextUrl; page++) {
      const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!res.ok) {
        // delta link vencido → reiniciar full desde inbox
        if (res.status === 410) { nextUrl = START_DELTA; newDeltaLink = null; continue }
        return NextResponse.json({ error: `Graph ${res.status}` }, { status: 502 })
      }
      const j = (await res.json()) as { value?: unknown[]; '@odata.nextLink'?: string; '@odata.deltaLink'?: string }
      for (const raw of j.value ?? []) {
        const m = parseGraphMessage(raw)
        if (m && m.fromEmail) messages.push(m)
      }
      if (j['@odata.deltaLink']) { newDeltaLink = j['@odata.deltaLink']; nextUrl = null }
      else if (j['@odata.nextLink']) { nextUrl = j['@odata.nextLink']; newDeltaLink = j['@odata.nextLink'] }
      else nextUrl = null
    }
  } catch (e) {
    reportApiError(e, { route: 'email/sync', step: 'fetch' })
    return NextResponse.json({ error: 'Falló la lectura de correos' }, { status: 502 })
  }

  // 3) Agrupar por remitente → un batch del reader por persona (helper compartido
  //    con /api/email/ingest).
  const { ingested, senders } = await ingestEmailMessages(
    supabase as unknown as SupabaseClient, userId, messages, { route: 'email/sync' },
  )

  await supabase.from('email_connections').update({
    delta_link: newDeltaLink, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq('id', conn.id)

  return NextResponse.json({ ok: true, fetched: messages.length, senders, ingested })
}
