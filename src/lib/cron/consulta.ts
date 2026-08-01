// SIR V2 — Consultas de cron que NO pueden fallar en silencio. PURO.
//
// ═══ EL PROBLEMA, MEDIDO ══════════════════════════════════════════════════════
//
// PostgREST no lanza: manda el error a `.error` y deja `data` en null. Casi ningún
// cron de este repo revisa `.error`, y donde eso duele de verdad es en la consulta
// que arma la LISTA DE USUARIOS o de CONEXIONES, porque el patrón siempre es:
//
//     const { data: conns } = await admin.from('calendar_connections')...
//     const uids = [...new Set((conns ?? []).map(c => c.user_id))]
//     if (uids.length === 0) return NextResponse.json({ usuarios: 0, ... })   // 200
//
// Si la consulta falla, `uids` queda vacío y el cron responde **200 diciendo que no
// había nada que hacer**. Vercel lo pinta verde. Así `status-diff` se saltó el 26,
// el 30 y el 31 de julio de 2026 sin que nadie se enterara en 6 días (#1065), y así
// `gcal-sync` podría reportar *"sin conexiones de Google"* con la cuenta conectada
// perfectamente — el mensaje exacto que haría buscar el bug en el lugar equivocado.
//
// ═══ POR QUÉ ESTO Y NO "REVISAR .error CADA VEZ" ══════════════════════════════
//
// Porque revisar a mano es justo lo que ya falló. Son 13 crons y ~40 consultas; la
// disciplina se rompe en la primera que uno escribe apurado. Esto lo vuelve la vía
// CORTA: `filasOFalla(res, 'conexiones')` es más breve que desestructurar `data` y
// `error` por separado, así que se usa por comodidad y no por virtud.
//
// PURO: no toca red ni DB, solo interpreta una respuesta ya obtenida.

/** La forma de una respuesta de PostgREST, sin acoplarse a los tipos de Supabase. */
export interface RespuestaPostgrest<T> {
  data: T[] | null
  error: { message: string } | null
}

/** Igual, para `.maybeSingle()` / `.single()`. */
export interface RespuestaUna<T> {
  data: T | null
  error: { message: string } | null
}

/**
 * Las filas, o LANZA si la consulta falló. PURA.
 *
 * `que` describe qué se estaba pidiendo, en castellano y pensado para que el
 * mensaje sirva leído solo en Sentry seis semanas después: "conexiones de Google",
 * no "calendar_connections".
 *
 * Un arreglo VACÍO sin error se devuelve tal cual: eso es un vacío legítimo y el
 * caller decide qué significa. La diferencia entre "no hay filas" y "no pude
 * preguntar" es todo el punto de este módulo.
 */
export function filasOFalla<T>(res: RespuestaPostgrest<T>, que: string): T[] {
  if (!res) throw new Error(`${que}: respuesta vacía del cliente`)
  if (res.error) throw new Error(`${que}: ${res.error.message}`)
  return res.data ?? []
}

/** Una fila (o null), o LANZA si la consulta falló. PURA. */
export function unaOFalla<T>(res: RespuestaUna<T>, que: string): T | null {
  if (!res) throw new Error(`${que}: respuesta vacía del cliente`)
  if (res.error) throw new Error(`${que}: ${res.error.message}`)
  return res.data ?? null
}

/**
 * Como `filasOFalla`, pero además LANZA si viene vacío. PURA.
 *
 * Para invariantes de este sistema en particular: SIR es mono-usuario en la
 * práctica, así que "cero usuarios con perfil" no es un vacío legítimo — es una
 * consulta que falló o una env apuntando a la base equivocada. Tratarlo como
 * "no había nada que hacer" es cómo un cron se muere en verde.
 *
 * NO usar para vacíos genuinos (hoy no hay recordatorios que vencen, hoy no hay
 * momentos nuevos): ahí `filasOFalla` es lo correcto.
 */
export function filasNoVaciasOFalla<T>(res: RespuestaPostgrest<T>, que: string): T[] {
  const filas = filasOFalla(res, que)
  if (filas.length === 0) throw new Error(`${que}: cero filas, y acá eso no es posible`)
  return filas
}
