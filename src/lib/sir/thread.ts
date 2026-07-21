// SIR V2 — Hilo conversacional unificado (Fase 2). Lectura/escritura de
// sir_messages (mig 0143), el hilo canónico por usuario compartido cross-canal
// (web, PWA, Telegram). Todo FAIL-OPEN: si la tabla no existe aún o falla, la
// conversación sigue (getSirThread → [], appendSirThread → no-op). El caller
// resuelve el `supabase` (sesión con RLS en la web, service-role en Telegram).

import type { SupabaseClient } from '@supabase/supabase-js'

export type SirChannel = 'web' | 'telegram'
export interface SirTurn { role: 'user' | 'sir'; text: string }
/** Turno con metadatos, para la UI del hilo unificado: qué canal lo originó y
 *  cuándo (para separadores de día, timestamp y marca "vía Telegram"). */
export interface SirTurnDetailed extends SirTurn { channel: SirChannel; at: string }

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
 * Igual que getSirThread pero CON metadatos (channel + created_at). Para la web
 * (`/api/sir/thread`): preservar el canal y el timestamp permite los separadores
 * de día, la hora de cada turno y la marca "vía Telegram" del hilo unificado.
 * Fail-open → [].
 */
export async function getSirThreadDetailed(
  client: SupabaseClient,
  userId: string,
  limit: number = 40,
): Promise<SirTurnDetailed[]> {
  try {
    const { data } = await client
      .from('sir_messages')
      .select('role, content, channel, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(limit, 100)))
    const rows = (data ?? []) as Array<{ role: string; content: string; channel: string; created_at: string }>
    return rows
      .filter((r) => (r.role === 'user' || r.role === 'sir') && typeof r.content === 'string' && r.content.length > 0)
      .map((r) => ({
        role: r.role as 'user' | 'sir',
        text: r.content,
        channel: (r.channel === 'telegram' ? 'telegram' : 'web') as SirChannel,
        at: r.created_at,
      }))
      .reverse()
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
): Promise<{ userAt: string; sirAt: string } | null> {
  const u = userText.trim()
  const s = sirText.trim()
  if (!u || !s) return null
  const now = new Date()
  const userAt = now.toISOString()
  const sirAt = new Date(now.getTime() + 1).toISOString()
  try {
    await client.from('sir_messages').insert([
      { user_id: userId, role: 'user', content: u.slice(0, MAX_CONTENT), channel, created_at: userAt },
      { user_id: userId, role: 'sir', content: s.slice(0, MAX_CONTENT), channel, created_at: sirAt },
    ])
    // Devuelve los timestamps persistidos para que la web registre sus PROPIOS
    // turnos y el polling del hilo unificado no los re-agregue como duplicados.
    return { userAt, sirAt }
  } catch {
    return null // fail-open
  }
}
