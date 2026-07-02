// SIR V2 — Personal Access Tokens (server-side).
//
// Utilidades para:
//   1. Generar tokens nuevos (create) — devuelve la version PLANA una vez.
//   2. Resolver un bearer token entrante → user_id (authenticateBearer).
//   3. Formato de token: `sirp_<base64url-32bytes>`. Prefix visible los
//      primeros 10 caracteres (incluyendo `sirp_`).
//
// Storage: solo el HASH SHA-256 vive en DB. Al revocar seteamos revoked_at
// (soft delete) — nunca se reusa el hash aunque se recree.
//
// Lookup con SERVICE ROLE: el cliente que trae el bearer NO tiene sesión
// Supabase, así que RLS no aplica. Usamos el service_role para consultar
// la tabla personal_tokens y sacar el user_id. Los endpoints que llame
// después deberían filtrar por ese user_id manualmente (RLS aún no aplica
// porque la sesión no está seteada) O crearse un cliente con
// `auth.uid()` inyectado. Este helper devuelve el user_id crudo.

import { createHash, randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createClient as createSessionClient } from '@/lib/supabase/server'

const PREFIX = 'sirp_'
const VISIBLE_PREFIX_LEN = 10 // "sirp_9x2K" — 10 chars mostrables

function serviceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars faltan (URL / SERVICE_ROLE_KEY)')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

/** Genera un token nuevo. Devuelve la parte plana (mostrar 1 vez al usuario)
 *  + el prefix visible + el hash para guardar. */
export function generateTokenParts(): { plain: string; prefix: string; hash: string } {
  const random = randomBytes(24).toString('base64url').replace(/[^A-Za-z0-9]/g, '')
  const plain = `${PREFIX}${random}`
  const prefix = plain.slice(0, VISIBLE_PREFIX_LEN)
  const hash = sha256Hex(plain)
  return { plain, prefix, hash }
}

export { formatRelative } from './tokensFormat'

export interface AuthenticatedUser { userId: string; tokenId?: string }

/** Resuelve el user_id a partir del header Authorization: Bearer <token>.
 *  Devuelve null si no hay token o es inválido/revocado. */
export async function authenticateBearer(bearerHeader: string | null | undefined): Promise<AuthenticatedUser | null> {
  if (!bearerHeader) return null
  const m = bearerHeader.match(/^Bearer\s+([A-Za-z0-9_-]{20,})$/i)
  if (!m) return null
  const token = m[1]
  if (!token.startsWith(PREFIX)) return null
  const hash = sha256Hex(token)
  const supabase = serviceRoleClient()
  const { data } = await supabase
    .from('personal_tokens')
    .select('id, user_id, revoked_at')
    .eq('token_hash', hash)
    .limit(1)
    .maybeSingle()
  const row = data as { id: string; user_id: string; revoked_at: string | null } | null
  if (!row || row.revoked_at) return null
  // Best-effort: actualizar last_used_at sin bloquear la respuesta.
  void supabase
    .from('personal_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .then(() => {}, () => {})
  return { userId: row.user_id, tokenId: row.id }
}

/** Auth combinada: primero session-auth (cookies), después bearer. Devuelve
 *  el user_id o null. Uso típico:
 *    const user = await authenticateRequest(req)
 *    if (!user) return 401
 *    // ...usar user.userId con service_role o session_client. */
export async function authenticateRequest(req: Request): Promise<AuthenticatedUser | null> {
  // 1. Session cookies (path preferido — es la UI de Aaron).
  try {
    const supabase = await createSessionClient()
    const { data } = await supabase.auth.getUser()
    if (data?.user) return { userId: data.user.id }
  } catch { /* fall through a bearer */ }
  // 2. Bearer.
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization')
  return authenticateBearer(auth)
}
