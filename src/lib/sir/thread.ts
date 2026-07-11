// SIR V2 — Hilo conversacional unificado (Fase 2). Lectura/escritura de
// sir_messages (mig 0143), el hilo canónico por usuario compartido cross-canal
// (web, PWA, Telegram). Todo FAIL-OPEN: si la tabla no existe aún o falla, la
// conversación sigue (getSirThread → [], appendSirThread → no-op). El caller
// resuelve el `supabase` (sesión con RLS en la web, service-role en Telegram).

import type { SupabaseClient } from '@supabase/supabase-js'

export type SirChannel = 'web' | 'telegram'
export interface SirTurn { role: 'user' | 'sir'; text: string }

const DEFAULT_LIMIT = 12
const MAX_CONTENT = 4000

/**
 * Últimos `limit` turnos del hilo del usuario, en orden CRONOLÓGICO (viejo→nuevo),
 * listos para pasar como `history` a askSir(). Fail-open → [].
 */
export async function getSirThread(
  client: SupabaseClient,
  userId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<SirTurn[]> {
  try {
    const { data } = await client
      .from('sir_messages')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 50)))
    const rows = (data ?? []) as Array<{ role: string; content: string }>
    return rows
      .filter((r) => (r.role === 'user' || r.role === 'sir') && typeof r.content === 'string' && r.content.length > 0)
      .map((r) => ({ role: r.role as 'user' | 'sir', text: r.content }))
      .reverse() // la query trae desc (más nuevo primero) → cronológico
  } catch {
    return []
  }
}

/**
 * Appendea el turno de usuario + el de SIR al hilo, con el canal de origen. El
 * turno de SIR queda 1ms después que el de usuario para preservar el orden al
 * releer por created_at (ambos comparten transacción → mismo now() del server).
 * Fail-open: un fallo de persistencia NO debe romper la respuesta.
 */
export async function appendSirThread(
  client: SupabaseClient,
  userId: string,
  channel: SirChannel,
  userText: string,
  sirText: string,
): Promise<void> {
  const u = userText.trim()
  const s = sirText.trim()
  if (!u || !s) return
  const now = new Date()
  try {
    await client.from('sir_messages').insert([
      { user_id: userId, role: 'user', content: u.slice(0, MAX_CONTENT), channel, created_at: now.toISOString() },
      { user_id: userId, role: 'sir', content: s.slice(0, MAX_CONTENT), channel, created_at: new Date(now.getTime() + 1).toISOString() },
    ])
  } catch {
    /* fail-open */
  }
}
