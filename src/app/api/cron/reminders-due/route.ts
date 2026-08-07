// SIR V2 — GET /api/cron/reminders-due
//
// Respaldo diario (vercel.json: 0 11 * * * ≈ 6am Lima) para app CERRADA. El
// camino primario es el watcher client-side /api/reminders/fire-due (app abierta).
// LIMITACIÓN (plan Hobby): con la app cerrada, un recordatorio con hora solo se
// pushea en el próximo tick diario, no a su hora exacta. Busca reminders con
// due_at <= now, done_at IS NULL, notified_at IS NULL. Por cada uno:
//   1. Dispara push notification al user (best-effort).
//   2. Marca notified_at para no re-disparar.
// Auth: CRON_SECRET.

import { NextResponse, type NextRequest } from 'next/server'
import { filasOFalla } from '@/lib/cron/consulta'
import { puedeMarcarseAvisado, resumenDeEntrega, type Entrega } from '@/lib/push/entrega'
import { reportApiError } from '@/lib/observability/reportApiError'
import { logEvent } from '@/lib/observability/logEvent'
import { createClient } from '@supabase/supabase-js'
import { pushToUser } from '@/lib/push/notify'
import { isTelegramConfigured, sendTelegramKeyboard, sendTelegramMessage } from '@/lib/telegram/client'
import { textoRecordatorio } from '@/lib/push/cuandoVence'
import { botonesDeToma, horaDeRecordatorioDeToma, fechaDeRecordatorioDeToma, cuandoDeLaToma, textoDeToma, slotDeDosis } from '@/lib/meds/telegramToma'
import { limaDayString } from '@/lib/habits/streak'
import { medsDeLaToma } from '@/lib/meds/tomaPendiente'
import { materializarTomas } from '@/lib/meds/materializar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase envs missing' }, { status: 500 })

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const nowMs = Date.now()

  // ═══ PRIMERO: RELLENAR LA COLA DE TOMAS ═══════════════════════════════════
  //
  // Los avisos de medicación son filas materializadas, y hasta el 5-ago-2026 las creaba
  // un script a mano en ventanas de 14 días. Medido ese día contra producción: la última
  // era `rem_med_2026-08-16_2200`. **Del 17-ago en adelante este cron no iba a encontrar
  // ninguna fila, no iba a preguntar nada, y este endpoint iba a responder 200 OK** —
  // sin error, sin telemetría. Adentro de esa ventana: topiramato y clonazepam, crónicos.
  //
  // Va ANTES de la consulta a propósito: lo que se cree acá ya entra en esta misma
  // corrida si vence dentro del lookahead. Y va en este cron —no en uno nuevo— porque
  // es el que ya vigila esta tabla y corre a diario: mientras él viva, la cola no se
  // vacía. Un cron nuevo sería una pieza más que se puede morir aparte.
  const tomas = { creadas: 0, cubiertoHasta: null as string | null }
  try {
    const { data: conRecetas } = await supabase
      .from('med_prescriptions').select('user_id').eq('status', 'activa')
    const uids = [...new Set(((conRecetas as Array<{ user_id: string }>) ?? []).map((r) => r.user_id))]
    for (const uid of uids) {
      const r = await materializarTomas(supabase, uid, limaDayString(new Date(nowMs)))
      // Que falle es exactamente el silencio que esto vino a matar: se reporta.
      if (r.error) reportApiError(new Error(`materializar tomas (${uid}): ${r.error}`), { route: 'cron/reminders-due' })
      tomas.creadas += r.creadas
      if (r.cubiertoHasta && (!tomas.cubiertoHasta || r.cubiertoHasta > tomas.cubiertoHasta)) {
        tomas.cubiertoHasta = r.cubiertoHasta
      }
    }
  } catch (e) {
    reportApiError(e instanceof Error ? e : new Error(String(e)), { route: 'cron/reminders-due' })
  }

  // ═══ MIRA HACIA ADELANTE, NO SOLO HACIA ATRÁS ═════════════════════════════
  //
  // Antes la consulta era `due_at <= now` y con un cron DIARIO eso llega tarde:
  // cualquier recordatorio que venza entre dos corridas se avisa hasta 23 h después
  // de su hora. Para algo con hora fija es fatal.
  //
  // Caso REAL, encontrado el 31-jul-2026 y a 7 días de ocurrir: su examen médico del
  // IPD para el Mundial, el **7-ago a las 8:10 am**, cargado con `due_at` 12:00 UTC
  // (07:00 Lima). El cron corre 11:00 UTC → ese día `due_at` **todavía no había
  // vencido** y no disparaba; la corrida siguiente era el **8-ago, un día DESPUÉS
  // del examen.** Nunca se lo iba a avisar.
  //
  // Y el aviso del mismo día ya era inútil: el examen pide **ayuno de 8 h** (empieza
  // la noche anterior), **Anexo 2 impreso** y un **formulario psicológico previo**.
  //
  // 36 h de anticipación: alcanza para que algo de mañana temprano se avise HOY, con
  // la noche de por medio. Es una sola notificación (`notified_at` la cierra), así
  // que el texto tiene que decir CUÁNDO es — si no, "recordatorio: examen 8:10am"
  // leído un día antes se entiende como si fuera hoy.
  const LOOKAHEAD_HORAS = 36
  const hasta = new Date(nowMs + LOOKAHEAD_HORAS * 3_600_000).toISOString()

  // `filasOFalla`, no `data ?? []`: si esta consulta falla, PostgREST no lanza y
  // `rows` queda vacío, así que el cron responde **200 con `processed: 0`** — se ve
  // idéntico a "hoy no vence nada". Y lo que vence acá son cosas como el examen del
  // IPD del 7-ago a las 8:10 con 8 h de ayuno: un aviso perdido en silencio no se
  // recupera al día siguiente. Ahora un fallo se ve como fallo. [[postgrest-columna-inexistente]]
  const rows = filasOFalla<{ id: string; user_id: string; text: string; related_person_id: string | null; due_at: string | null; med_prescription_id: string | null }>(
    await supabase.from('reminders')
      .select('id, user_id, text, related_person_id, due_at, med_prescription_id')
      .lte('due_at', hasta).is('done_at', null).is('notified_at', null).limit(50),
    'recordatorios que vencen',
  )
  // ═══ LA TRAZA DE LA CORRIDA ═══════════════════════════════════════════════
  //
  // Misma razón que en `evening-push`: sin esto, "¿corrió?" solo se podía inferir
  // de si dejó efectos, y este cron TIENE un camino legítimo en el que no deja
  // ninguno ("hoy no vence nada"). Ahí la evidencia de dominio no alcanza y la
  // fila es la única prueba de vida. Se traza en los DOS retornos a propósito:
  // el `processed: 0` es justamente el que se veía igual que no haber corrido.
  const trazaUid = process.env.TELEGRAM_OWNER_USER_ID?.trim() || rows[0]?.user_id || null
  const traza = async (meta: Record<string, unknown>): Promise<void> => {
    if (!trazaUid) return
    await logEvent(supabase, trazaUid, {
      type: 'reminders-due',
      ok: true,
      route: 'cron/reminders-due',
      durationMs: Date.now() - nowMs,
      meta,
    })
  }

  // Cero con la consulta OK sí es legítimo: hoy no vence nada.
  if (rows.length === 0) {
    await traza({ processed: 0, tomas })
    return NextResponse.json({ processed: 0, tomas })
  }

  // Traer person slug para deep-link.
  const pids = [...new Set(rows.map((r) => r.related_person_id).filter((v): v is string => v != null))]
  const slugById = new Map<string, string | null>()
  if (pids.length > 0) {
    const { data: peopleRaw } = await supabase.from('people').select('id, slug').in('id', pids)
    for (const p of ((peopleRaw ?? []) as Array<{ id: string; slug: string | null }>)) slugById.set(p.id, p.slug)
  }

  // Entrega TAMBIÉN por Telegram al dueño (el Web Push depende de VAPID, que
  // puede no estar configurado; Telegram está vivo). Mismo patrón que morning-push.
  const tgReady = isTelegramConfigured()
  const tgOwnerId = process.env.TELEGRAM_OWNER_USER_ID?.trim() || null
  const tgChat = process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim() || null

  // ═══ `notified_at` SIGNIFICA "SE LE DIJO", NO "SE INTENTÓ DECIRLE" ══════════
  //
  // Antes se marcaba SIEMPRE. La intención era no repetir el aviso, pero el efecto
  // era que **un aviso que no llegó se cerraba para siempre**. Y no había forma de
  // saberlo: `pushToUser` devuelve `{ sent, failed }` y se lo llamaba con `void`,
  // y el envío de Telegram vivía en un `catch {}` que se comía el error.
  //
  // Medido el 1-ago-2026: la ÚNICA suscripción de Web Push es de Apple y es del
  // 13-jun (esas caducan). Si esa falla y Telegram tropieza, el recordatorio del
  // examen del IPD del 7-ago —8:10 am, ayuno de 8 h, Anexo 2 impreso— quedaba
  // marcado como avisado y el examen se pasaba en silencio.
  //
  // Ahora: si ningún canal entregó, se deja ABIERTO y mañana se reintenta.
  // Reintentar es molesto; perder el examen que habilita el Mundial no tiene
  // arreglo. [[fechas-clave-de-aaron]]
  let notified = 0
  let sinEntregar = 0
  let tomasDiferidas = 0
  const hoyLima = limaDayString(new Date(nowMs))
  for (const r of rows) {
    // ═══ UNA TOMA DE LA NOCHE NO SE ANUNCIA A LAS 6 DE LA MAÑANA ══════════════
    //
    // Aaron, 4-ago-2026: *"acá me pregunta si ya tomé todas estas pastillas, pero
    // anoche te dije que la mayoría eran ANTES DE DORMIR, entonces qué sentido
    // tiene que me pregunte en la mañana si las acabo de tomar si el objetivo es
    // tomarlas en la noche"*.
    //
    // Tenía toda la razón. Este cron corre 06:00 de Lima y mira 36 h adelante, así
    // que la toma de las 22:00 de HOY entraba con ~16 h de anticipación y se
    // anunciaba con el texto de "toca lo que ya tomaste". Se cerraba con
    // `notified_at` y no volvía nunca — el aviso útil, a su hora, no existía.
    //
    // Ahora la toma que todavía NO venció se la deja a `evening-push` (21:00 de
    // Lima, una hora antes). No se marca `notified_at`: queda abierta a propósito.
    // Y si esa corrida nocturna fallara, mañana este mismo cron la ve VENCIDA y
    // pregunta "¿tomaste la de anoche?" — que es la pregunta correcta para el
    // pasado. Ningún camino la pierde en silencio.
    const horaToma = horaDeRecordatorioDeToma(r.id)
    const vencida = r.due_at ? Date.parse(r.due_at) <= nowMs : true
    if (horaToma && !vencida) {
      tomasDiferidas++
      continue
    }
    const slug = r.related_person_id ? slugById.get(r.related_person_id) : null
    const cuerpo = textoRecordatorio(r.text, r.due_at, nowMs)
    const entregas: Entrega[] = []

    try {
      const res = await pushToUser(r.user_id, {
        title: 'SIR · Recordatorio',
        body: cuerpo,
        url: slug ? `/relaciones/${slug}` : '/panel',
        tag: `reminder-${r.id}`,
        requireInteraction: false,
      })
      entregas.push({
        canal: 'web-push',
        entregado: res.sent > 0,
        ...(res.sent > 0 ? {} : { detalle: `sent=0 failed=${res.failed} disabled=${res.disabled}` }),
      })
    } catch (e) {
      entregas.push({ canal: 'web-push', entregado: false, detalle: String(e).slice(0, 100) })
    }

    if (tgReady && tgChat && tgOwnerId && r.user_id === tgOwnerId) {
      try {
        // ═══ RECORDATORIO DE MEDICACIÓN: va CON BOTONES ═══
        //
        // Aaron pidió el aviso Y el conteo. Si para registrar la toma hay que abrir la
        // app, el conteo queda en cero y el panel dice "falta la de hoy" para siempre
        // — el mismo hueco del 👍/👎, que se le pidió durante semanas cuando en
        // Telegram no había botón (#1030). Un tap = una toma.
        //
        // Los medicamentos se resuelven por el `schedule` de los ítems, NO por el texto
        // del mensaje. Si no se puede resolver ninguno, se manda el aviso de siempre:
        // mejor un recordatorio sin botón que ningún recordatorio.
        //
        // La hora sale del ID, no del `due_at`: sólo los recordatorios que SON una toma
        // llevan botones. Otros recordatorios pueden colgar de la misma receta sin ser
        // una toma —el de los 5 laboratorios del neurólogo es su monitoreo— y derivarlo
        // de la hora les habría reemplazado el texto por el de la medicación.
        const hora = horaToma
        // El SLOT identifica la dosis (fecha + hora). Sin esto, el tap de la mañana
        // sobre "¿tomaste la de anoche?" se guardaba en el día de HOY y tapaba la
        // dosis real de esta noche. Ver .
        const slot = slotDeDosis(fechaDeRecordatorioDeToma(r.id), hora)
        const meds = hora ? await medsDeLaToma(supabase, r.user_id, hora, nowMs, slot) : []
        const filas = meds.length > 0 ? botonesDeToma(meds, hora as string, slot) : []
        if (filas.length > 0) {
          // Acá solo llegan tomas YA VENCIDAS (las futuras se difirieron arriba), así
          // que el texto pregunta por el pasado en vez de afirmar que "ya la tomaste".
          const cuando = cuandoDeLaToma(fechaDeRecordatorioDeToma(r.id), hoyLima)
          await sendTelegramKeyboard(Number(tgChat), textoDeToma(meds, hora as string, cuando), filas)
        } else {
          await sendTelegramMessage(Number(tgChat), `⏰ Recordatorio: ${cuerpo}`)
        }
        entregas.push({ canal: 'telegram', entregado: true })
      } catch (e) {
        entregas.push({ canal: 'telegram', entregado: false, detalle: String(e).slice(0, 100) })
      }
    }

    const resumen = resumenDeEntrega(entregas)
    if (resumen) reportApiError(new Error(`reminder ${r.id}: ${resumen}`), { route: 'cron/reminders-due' })

    if (puedeMarcarseAvisado(entregas)) {
      await supabase.from('reminders').update({ notified_at: new Date().toISOString() }).eq('id', r.id)
      notified++
    } else {
      // Queda abierto a propósito: el próximo tick lo reintenta.
      sinEntregar++
    }
  }

  await traza({ processed: rows.length, notified, sinEntregar, tomasDiferidas, tomas })
  return NextResponse.json({ processed: rows.length, notified, sinEntregar, tomasDiferidas, tomas })
}
