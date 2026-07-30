// SIR V2 — 👍/👎 sobre las respuestas de SIR EN TELEGRAM.
//
// ═══ POR QUÉ EXISTE ══════════════════════════════════════════════════════════
//
// `chat_feedback` estuvo en **0 filas** desde que se construyó, y en cada sesión se
// le listó a Aaron como SU pendiente: "califica una respuesta, es lo único que
// destraba el loop de aprendizaje". El 30-jul-2026 él contestó *"no veo en ningún
// lado dónde marcar like o dislike"*, se fue a mirar, y tenía razón:
//
//   · En **Telegram —su canal principal— los botones NO EXISTÍAN.** Cero. La tabla
//     ya tenía la columna `channel` aceptando 'telegram' desde el día uno: estaba
//     diseñado para esto y nunca se cableó.
//   · En la web existían, pero como iconos de **13 px al 50% de opacidad**
//     (`text-muted-foreground/50`). Un fantasma gris.
//
// O sea: el cuello de botella declarado de toda la Ola 3 no era que Aaron no
// calificara. Era que no había dónde. Se le pidió durante semanas algo imposible.
//
// ═══ CÓMO SE IDENTIFICA EL TURNO ═════════════════════════════════════════════
//
// `callback_data` de Telegram tiene un techo de **64 bytes**, así que no se puede
// mandar la pregunta ni la respuesta adentro. Se usa el timestamp que
// `appendSirThread` ya devuelve al persistir el turno en `sir_messages`
// (`fb|u|2026-07-30T16:45:12.345Z` ≈ 29 bytes): al tap se recupera el par
// pregunta/respuesta de ahí. Nada de tablas nuevas ni de estado en memoria — el
// turno ya estaba guardado, solo faltaba poder apuntarle.

import type { SupabaseClient } from '@supabase/supabase-js'

import { answerCallbackQuery, type InlineButton } from './client'

/** Prefijo del callback. Corto porque compite con el timestamp por los 64 bytes. */
const PREFIJO = 'fb|'

export interface FeedbackTap {
  rating: 'up' | 'down'
  /** ISO del mensaje de SIR en `sir_messages`, que hace de id del turno. */
  sirAt: string
}

/**
 * Los dos botones que acompañan cada respuesta de SIR. PURA.
 *
 * Devuelve `[]` si no hay timestamp: sin id no hay a qué atar el voto, y un botón
 * que no puede guardar nada es peor que ninguno.
 */
export function feedbackButtons(sirAt: string | null | undefined): InlineButton[] {
  if (!sirAt) return []
  return [
    { text: '👍 Me sirve', callbackData: `${PREFIJO}u|${sirAt}` },
    { text: '👎 No', callbackData: `${PREFIJO}d|${sirAt}` },
  ]
}

/** Parsea el callback. PURA. null si no es de feedback o viene mal formado. */
export function parseFeedbackCallback(data: string): FeedbackTap | null {
  if (!data || !data.startsWith(PREFIJO)) return null
  const resto = data.slice(PREFIJO.length)
  const corte = resto.indexOf('|')
  if (corte <= 0) return null
  const letra = resto.slice(0, corte)
  const sirAt = resto.slice(corte + 1)
  if (!sirAt) return null
  if (letra === 'u') return { rating: 'up', sirAt }
  if (letra === 'd') return { rating: 'down', sirAt }
  return null
}

/**
 * Recupera el par (pregunta, respuesta) de `sir_messages` a partir del timestamp
 * del mensaje de SIR.
 *
 * `appendSirThread` inserta el turno del usuario y el de SIR con 1 ms de
 * diferencia, así que la pregunta es el ÚLTIMO mensaje de rol 'user' anterior a
 * `sirAt`. Se busca así en vez de restar 1 ms a mano para no depender de ese
 * detalle de implementación.
 */
async function recuperarTurno(
  db: SupabaseClient, userId: string, sirAt: string,
): Promise<{ question: string | null; answer: string } | null> {
  const { data: sirRow } = await db
    .from('sir_messages')
    .select('content, created_at')
    .eq('user_id', userId).eq('role', 'sir').eq('created_at', sirAt)
    .maybeSingle()
  const answer = (sirRow as { content?: string } | null)?.content
  if (!answer) return null

  const { data: userRow } = await db
    .from('sir_messages')
    .select('content')
    .eq('user_id', userId).eq('role', 'user').lt('created_at', sirAt)
    .order('created_at', { ascending: false }).limit(1)
  const question = ((userRow ?? []) as Array<{ content?: string }>)[0]?.content ?? null
  return { question, answer }
}

/**
 * Maneja el tap. Guarda en `chat_feedback` con `channel='telegram'` (la misma
 * tabla que la web: una sola señal, no dos ledgers que después no coinciden).
 *
 * IDEMPOTENTE por turno: si Aaron vuelve a votar el mismo mensaje, se ACTUALIZA su
 * voto en vez de sumar una fila. Sin eso, tocar dos veces contaría como dos señales
 * y el harness de eval leería un 👎 que él ya había cambiado por 👍.
 */
export async function handleFeedbackTap(
  db: SupabaseClient,
  userId: string,
  callbackId: string,
  tap: FeedbackTap,
): Promise<void> {
  try {
    const turno = await recuperarTurno(db, userId, tap.sirAt)
    if (!turno) {
      await answerCallbackQuery(callbackId, 'No encontré ese mensaje 😕')
      return
    }

    // ¿Ya había votado este turno? Se busca por la respuesta exacta y el canal.
    const { data: prev } = await db
      .from('chat_feedback')
      .select('id')
      .eq('user_id', userId).eq('channel', 'telegram').eq('answer', turno.answer)
      .limit(1)
    const prevId = ((prev ?? []) as Array<{ id: string }>)[0]?.id ?? null

    if (prevId) {
      await db.from('chat_feedback').update({ rating: tap.rating }).eq('id', prevId).eq('user_id', userId)
    } else {
      await db.from('chat_feedback').insert({
        user_id: userId,
        question: turno.question?.slice(0, 4000) ?? null,
        answer: turno.answer.slice(0, 8000),
        rating: tap.rating,
        channel: 'telegram',
      })
    }

    // El 👎 pide la corrección, que es la señal que MÁS vale: "no me sirve" solo
    // dice que algo estuvo mal; "esperaba X" es lo que se puede aprender. Se pide
    // por texto porque en Telegram no hay input inline.
    const toast = tap.rating === 'up'
      ? 'Anotado 👍 gracias'
      : 'Anotado 👎 — respóndeme a este mensaje diciendo qué esperabas y lo aprendo'
    await answerCallbackQuery(callbackId, toast)

    // NO se edita el teclado a propósito. `editTelegramKeyboard` exige reenviar el
    // texto del mensaje, y Telegram rechaza con "message is not modified" cuando el
    // texto no cambió — se ganaría un error por cada voto a cambio de nada. El toast
    // ya confirma, y dejar los dos botones vivos hace que cambiar de opinión siga
    // siendo un toque (el guardado es idempotente por turno, así que no duplica).
  } catch {
    // Fail-soft: perder un voto no puede romper el webhook.
    await answerCallbackQuery(callbackId)
  }
}
