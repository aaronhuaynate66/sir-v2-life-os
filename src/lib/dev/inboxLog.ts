// SIR V2 — Red de seguridad de la bandeja de dev: registra TODO mensaje que le
// entra al bot antes de decidir qué hacer con él.
//
// POR QUÉ (28-jul-2026): Aaron preguntó "¿no hay nada en backlog que yo haya
// enviado desde Telegram?" y no se pudo responder. El webhook clasificaba cada
// mensaje y solo persistía los 'request' (como issue de GitHub); todo lo demás no
// dejaba rastro en ninguna parte. Si el clasificador fallaba —sin API key, API
// caída, JSON malo— un PEDIDO se contestaba como pregunta de estado y se perdía,
// sin registro ni forma de contarlo.
//
// Es el tercer caso del mismo patrón en una semana: el label que GitHub descarta
// en silencio (PR #997), el `.error` de PostgREST que nadie chequea (#947), y
// esto. **Degradar callado es el modo de falla de esta casa.** La regla: si el
// sistema no pudo hacer su trabajo, tiene que quedar dicho en algún lado.
//
// Escribe con service-role (no hay sesión en un webhook). Fail-soft absoluto: si
// el log falla, el bot igual responde — pero nunca al revés (primero se guarda,
// después se clasifica), así que un crash posterior no borra el pedido.

import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

export type DevInboxIntent = 'request' | 'status' | 'unknown'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Id determinístico por mensaje de Telegram → los reintentos del propio Telegram
 *  no duplican filas. Sin messageId cae al texto (peor, pero no rompe). */
export function devInboxId(chatId: string | number, messageId: number | undefined, text: string): string {
  const seed = messageId != null ? `${chatId}|${messageId}` : `${chatId}|${text.slice(0, 200)}`
  return `dim_${createHash('sha1').update(seed).digest('hex').slice(0, 32)}`
}

/**
 * Registra el mensaje ANTES de clasificarlo. Devuelve el id para poder
 * completarlo después con el veredicto. `null` si no se pudo escribir.
 */
export async function logDevInbound(
  chatId: string | number,
  messageId: number | undefined,
  text: string,
): Promise<string | null> {
  const db = admin()
  if (!db) return null
  const id = devInboxId(chatId, messageId, text)
  try {
    // intent arranca en 'unknown': si el proceso se cae entre esto y la
    // clasificación, la fila queda marcada para revisar — que es la verdad.
    const { error } = await db.from('dev_inbox_messages').upsert({
      id, chat_id: String(chatId), text: text.slice(0, 4000),
      intent: 'unknown', needs_review: true,
    }, { onConflict: 'id' })
    if (error) return null // PostgREST no lanza: el error viene en `.error`.
    return id
  } catch {
    return null
  }
}

/**
 * Cierra el registro con lo que realmente pasó. `needs_review` queda en true solo
 * cuando nadie juzgó el mensaje de verdad ('unknown'), o cuando era un pedido y
 * el issue no se pudo crear — ahí el pedido existe SOLO en esta tabla.
 */
export async function resolveDevInbound(
  id: string | null,
  intent: DevInboxIntent,
  issueNumber?: number | null,
): Promise<void> {
  if (!id) return
  const db = admin()
  if (!db) return
  const needsReview = intent === 'unknown' || (intent === 'request' && !issueNumber)
  try {
    await db.from('dev_inbox_messages')
      .update({ intent, issue_number: issueNumber ?? null, needs_review: needsReview })
      .eq('id', id)
  } catch {
    /* fail-soft: el mensaje ya quedó guardado, que es lo que importa */
  }
}
