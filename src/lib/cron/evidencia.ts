// SIR V2 — Mide en la base la EVIDENCIA que dejó cada trabajo vigilado.
//
// ═══ POR QUÉ EXISTE, Y POR QUÉ EN UN SOLO LUGAR ═══════════════════════════════
//
// El juicio ("¿está atrasado?") vive en `lib/cron/salud` y es PURO. Lo que faltaba
// era un solo lugar donde se LEA la evidencia: la misma consulta estaba copiada en
// `cron/morning-push` y en `api/estado`, con el comentario *"mismas dos mediciones
// que hace morning-push"* como único amarre. Agregar un trabajo obligaba a tocar
// dos archivos y confiar en que no derivaran — y un vigilante que vigila distinto
// según quién le pregunte no es un vigilante.
//
// ═══ SE MIRA LA EVIDENCIA, NO SI "CORRIÓ" ═════════════════════════════════════
//
// Un cron puede responder 200 habiendo hecho nada: un `select` que falla deja
// `data` en null, PostgREST no lanza, la ruta hace `if (length === 0) return 200`
// y Vercel lo pinta verde. [[postgrest-columna-inexistente]]
//
// ═══ `verificable` NO ES OPCIONAL ═════════════════════════════════════════════
//
// Si la consulta falla (tabla o columna renombrada) se devuelve
// `verificable: false` y `salud.ts` dice *"no lo puedo verificar"*, NUNCA
// *"está caído"*. Es la regla de honestidad de cobertura de CLAUDE.md aplicada al
// propio vigilante.

import type { SupabaseClient } from '@supabase/supabase-js'

import { limaDayString } from '@/lib/habits/streak'
import { EVENING_BRIEF_MARK } from '@/lib/telegram/eveningBrief'
import type { EstadoDeTrabajo } from './salud'

/**
 * La evidencia de cada trabajo de `VIGILADOS`, medida para `userId`.
 *
 * Cada medición es independiente y ninguna puede tumbar a las otras: van en un
 * `Promise.all` de bloques que capturan su propio error vía `verificable`.
 */
export async function medirEvidenciaDeCrons(
  client: SupabaseClient,
  userId: string,
): Promise<EstadoDeTrabajo[]> {
  return Promise.all([
    // status-diff deja un snapshot por día y por persona.
    (async (): Promise<EstadoDeTrabajo> => {
      const { data, error } = await client
        .from('person_status_snapshots')
        .select('snapshot_date')
        .eq('user_id', userId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
      const rows = (data as Array<{ snapshot_date: string }> | null) ?? []
      return { job: 'status-diff', verificable: !error, ultimoDia: rows[0]?.snapshot_date ?? null }
    })(),

    // morning-push marca `last_sent_day` en las señales que mandó.
    (async (): Promise<EstadoDeTrabajo> => {
      const { data, error } = await client
        .from('brief_sent_signals')
        .select('last_sent_day')
        .eq('user_id', userId)
        .not('last_sent_day', 'is', null)
        .order('last_sent_day', { ascending: false })
        .limit(1)
      const rows = (data as Array<{ last_sent_day: string }> | null) ?? []
      return { job: 'morning-push', verificable: !error, ultimoDia: rows[0]?.last_sent_day ?? null }
    })(),

    // ═══ evening-push: el 🌙 en `sir_messages` ═══════════════════════════════
    //
    // La noche del 5-ago-2026 este cron NO entregó nada —ni el cierre del día ni
    // el aviso de la toma de las 22:00— y **no había forma de notarlo**: los logs
    // de runtime de Vercel no se leen hacia atrás y no existía registro de
    // corridas. Se supo a las 04:00 de la mañana, a mano, mirando la base.
    //
    // Se mide contra `sir_messages` y no contra el registro de corridas nuevo
    // porque esta tabla YA tiene historia: el vigilante funciona hacia atrás
    // desde el día que se despliega, sin backfill y sin fecha de arranque que se
    // quede vieja. Medido: hay 🌙 el 3-ago y el 4-ago, y no el 5-ago.
    //
    // El día es el de LIMA, no el UTC: el brief de las 21:22 de Lima se guarda
    // como 02:22Z del día siguiente, y compararlo contra el día UTC lo contaría
    // en la fecha equivocada. [[hora-de-lima-tz-no-funciona]]
    (async (): Promise<EstadoDeTrabajo> => {
      const { data, error } = await client
        .from('sir_messages')
        .select('created_at')
        .eq('user_id', userId)
        .eq('role', 'sir')
        .eq('channel', 'telegram')
        .like('content', `${EVENING_BRIEF_MARK}%`)
        .order('created_at', { ascending: false })
        .limit(1)
      const rows = (data as Array<{ created_at: string }> | null) ?? []
      const iso = rows[0]?.created_at ?? null
      return {
        job: 'evening-push',
        verificable: !error,
        ultimoDia: iso ? limaDayString(new Date(iso)) : null,
      }
    })(),
  ])
}
