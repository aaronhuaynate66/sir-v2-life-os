// SIR V2 — Sesión OAuth de Google para ESCRIBIR (server-only).
//
// El reader (feed.ts) refresca tokens para LEER. Para escribir (crear eventos)
// necesitamos lo mismo desde una ruta distinta, sin acoplarnos al cache/ventana
// del feed. Este helper: carga la conexión google del usuario, devuelve un
// access_token vigente (refrescándolo + persistiéndolo si expiró) y el id de la
// conexión. Reusa el mismo cifrado (crypto) y el mismo refresh (google).
//
// RLS + .eq('user_id') explícito: el usuario solo toca lo suyo. Tokens NUNCA se
// loguean.

import type { createClient } from '@/lib/supabase/server'
import { decryptToken, encryptToken } from './crypto'
import { refreshAccessToken } from './google'

type ServerSupabase = Awaited<ReturnType<typeof createClient>>

interface GoogleConnRow {
  id: string
  account_email: string | null
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
}

/**
 * Carga la conexión Google habilitada del usuario. Si `connectionId` viene, la
 * exige; si no, toma la más reciente. Devuelve null si no hay ninguna.
 */
export async function loadGoogleConnection(
  supabase: ServerSupabase,
  userId: string,
  connectionId?: string | null,
): Promise<GoogleConnRow | null> {
  try {
    let q = supabase
      .from('calendar_connections')
      .select('id, account_email, access_token, refresh_token, token_expires_at')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .eq('enabled', true)
    if (connectionId) q = q.eq('id', connectionId)
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1)
    if (error || !data || data.length === 0) return null
    return data[0] as GoogleConnRow
  } catch {
    return null
  }
}

export interface FreshGoogleToken {
  token: string
  connectionId: string
  accountEmail: string | null
}

/**
 * Devuelve un access_token vigente para escribir en Google Calendar. Refresca y
 * persiste el token cifrado si expiró. Devuelve null si no hay conexión o no se
 * puede obtener un token usable (ej. refresh revocado). PERSISTE en DB.
 */
export async function ensureFreshGoogleToken(
  supabase: ServerSupabase,
  userId: string,
  connectionId?: string | null,
  nowMs: number = Date.now(),
): Promise<FreshGoogleToken | null> {
  const conn = await loadGoogleConnection(supabase, userId, connectionId)
  if (!conn) return null

  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
  const stillValid = expiresAt > nowMs + 30_000
  const currentPlain = decryptToken(conn.access_token)
  if (stillValid && currentPlain) {
    return { token: currentPlain, connectionId: conn.id, accountEmail: conn.account_email }
  }

  const refreshPlain = decryptToken(conn.refresh_token)
  if (!refreshPlain) {
    // Sin refresh_token: devolvemos el que haya (Google dirá si murió).
    return currentPlain ? { token: currentPlain, connectionId: conn.id, accountEmail: conn.account_email } : null
  }
  try {
    const tok = await refreshAccessToken(refreshPlain)
    const newExpiresAt = new Date(nowMs + Math.max(0, (tok.expires_in ?? 3600) - 30) * 1000).toISOString()
    await supabase
      .from('calendar_connections')
      .update({
        access_token: encryptToken(tok.access_token),
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conn.id)
      .eq('user_id', userId)
    return { token: tok.access_token, connectionId: conn.id, accountEmail: conn.account_email }
  } catch {
    // Refresh falló: intentá con el viejo (mejor que nada); si tampoco, null.
    return currentPlain ? { token: currentPlain, connectionId: conn.id, accountEmail: conn.account_email } : null
  }
}
