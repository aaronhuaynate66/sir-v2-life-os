// SIR V2 — Ejecutor de los botones del brief de la mañana (hilo por secciones).
//
// El brief pasó de párrafo a hilo con botones (elección de Aaron 2026-07-25). Acá
// vive lo que hace cada botón; el webhook solo rutea. Todo devuelve un mensaje
// corto para editar el mensaje del brief — el resultado se ve donde estaba el
// botón, sin abrir la app.
//
// FAIL-SOFT: cualquier error devuelve un mensaje honesto, nunca lanza.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BriefActionKind } from './briefThread'
import { nombreDesdeHandle, parseOrgBatch } from '@/lib/social-reader/orgBatch'
import { inferParentOrg, orgSlug } from '@/lib/social-reader/entityKind'
import { parseRefDeCarita } from '@/lib/relaciones/pedirRegistro'
import { parseRefDeEncuentro } from '@/lib/relaciones/proponerEncuentro'
import { todayLimaKey } from '@/lib/dates/limaDay'
import { MAX_PASOS, parsePlanPropuesto, fechaEnDias } from '@/lib/objetivos/metaSinPlan'
import { parseRefDeFecha, etiquetaDeFecha } from '@/lib/objetivos/sinFecha'

export interface BriefActionResult {
  /** Texto corto para el toast del botón (Telegram lo corta a ~200). */
  toast: string
  /** Si viene, se manda como mensaje aparte (un borrador, un próximo paso…). */
  reply?: string
}

/** Hoy a las 18:00 de Lima, en ISO UTC (Lima = UTC-5, sin horario de verano). */
export function todaySixPmLimaISO(now: Date): string {
  const limaKey = new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10)
  return `${limaKey}T23:00:00.000Z`
}

async function taskDone(supabase: SupabaseClient, userId: string, taskId: string): Promise<BriefActionResult> {
  const { data, error } = await supabase
    .from('objective_steps')
    .update({ status: 'hecho' })
    .eq('user_id', userId).eq('id', taskId)
    .select('title')
    .maybeSingle()
  if (error || !data) return { toast: 'No pude marcarla, inténtalo desde la app.' }
  return { toast: `✅ ${(data as { title: string }).title}` }
}

/**
 * "✅ Hice: Tender la cama" → marca el check-in del hábito de HOY.
 *
 * Aaron, 31-jul-2026: *"antes SIR me mandaba por Telegram una lista de mis pendientes
 * y ahí podía marcar uno por uno lo que había hecho, como tender la cama; ahora me
 * mandó todo junto y no puedo marcar que hice una sola cosa"*.
 *
 * El nudge del hábito llegaba SIN entidad, así que el único botón disponible era 🔕:
 * podía callar el recordatorio pero no registrar que lo había hecho. Este es el
 * camino que faltaba.
 *
 * IDEMPOTENTE por (hábito, día): tocar dos veces no suma dos check-ins ni infla la
 * racha. Si ya estaba marcado lo dice, en vez de fingir que acaba de marcarlo.
 */
async function habitDone(
  supabase: SupabaseClient, userId: string, habitId: string, now: Date,
): Promise<BriefActionResult> {
  const hoy = new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10) // día de Lima
  const { data: h } = await supabase
    .from('habits').select('title').eq('user_id', userId).eq('id', habitId).maybeSingle()
  const titulo = (h as { title?: string } | null)?.title ?? 'el hábito'

  const { data: ya } = await supabase
    .from('habit_checkins').select('id')
    .eq('user_id', userId).eq('habit_id', habitId).eq('date', hoy).limit(1)
  if (((ya ?? []) as unknown[]).length > 0) return { toast: `✅ ${titulo} ya estaba marcado hoy` }

  const { error } = await supabase.from('habit_checkins')
    .insert({ user_id: userId, habit_id: habitId, date: hoy })
  if (error) return { toast: 'No pude marcarlo, inténtalo desde la app.' }
  return { toast: `✅ ${titulo}` }
}

/**
 * Una de las 5 caritas → escribe el `person_log` de la interacción.
 *
 * Cierra el pedido de Aaron del 31-jul-2026: *"todo esto se arrastra porque no tenemos
 * un método más eficiente que te inyecte cada vez que tenga una conversación"*. El
 * camino para registrar YA existía (el panel de la ficha, `registrar_interaccion` por
 * chat) pero era PULL: había que acordarse. Hablaron en persona el lunes 27-jul, no
 * quedó registro, y el motor de estado siguió leyendo el 29-jul llamando "estable" a
 * la relación mientras discutían.
 *
 * Esto es el mismo dato, de UN toque, desde el brief que él sí lee.
 */
async function logInteraccion(
  supabase: SupabaseClient, userId: string, ref: string, now: Date,
): Promise<BriefActionResult> {
  const parsed = parseRefDeCarita(ref)
  // Sin ref válida NO se escribe nada: inventar un valor de tono es peor que no tener
  // el dato, porque después alimenta el diagnóstico de la relación.
  if (!parsed) return { toast: 'No pude leer ese botón.' }
  const { personId, valor } = parsed

  const { data: p } = await supabase
    .from('people').select('name').eq('user_id', userId).eq('id', personId).maybeSingle()
  const nombre = ((p as { name?: string } | null)?.name ?? 'esa persona').split(/\s+/)[0]

  const { error } = await supabase.from('person_logs').insert({
    user_id: userId, person_id: personId, kind: 'interaction',
    value: valor, note: 'Registrado de un toque desde el brief de la mañana.',
    logged_at: now.toISOString(),
  })
  if (error) return { toast: 'No pude anotarlo, inténtalo desde la ficha.' }

  // Se devuelve el número para que él vea QUÉ quedó guardado. Un "listo" a secas deja
  // la duda de si se anotó un 2 o un 4, y eso mueve el diagnóstico de la relación.
  const eco = valor <= 2 ? 'anotado, gracias por decirlo' : valor === 3 ? 'anotado' : 'anotado 💚'
  return { toast: `📝 ${nombre}: ${valor}/5 — ${eco}` }
}

/**
 * "💼 Registrar oportunidad" → crea el DEAL que faltaba y marca la señal.
 *
 * Es el cierre del loop que Aaron reclamó el 28-jul: SIR detectaba la ventana con
 * Miluska y no pasaba nada. Ahora, de un toque, la oportunidad entra al pipeline
 * con la cita textual como respaldo de por qué existe.
 */
async function opportunityRegister(
  supabase: SupabaseClient, userId: string, signalId: string, now: Date,
): Promise<BriefActionResult> {
  const { data: sig } = await supabase
    .from('opportunity_signals')
    .select('id, person_id, person_name, what, quote, quote_at, state, deal_id')
    .eq('user_id', userId).eq('id', signalId).maybeSingle()
  const s = sig as {
    person_id: string; person_name: string; what: string; quote: string
    quote_at: string; state: string; deal_id: string | null
  } | null
  if (!s) return { toast: 'No encontré esa señal.' }
  // Idempotente: si ya se registró, no crea un deal duplicado.
  if (s.state === 'registered' && s.deal_id) return { toast: `Ya estaba registrada como oportunidad.` }

  const dealId = `deal_opp_${signalId.replace(/^opp_/, '').slice(0, 24)}`
  const { error: dealErr } = await supabase.from('deals').upsert({
    id: dealId,
    user_id: userId,
    title: `${s.what} — ${s.person_name}`,
    stage: 'lead',
    status: 'open',
    currency: 'PEN',
    contact_person_id: s.person_id,
    source: 'Detectado en conversación (SIR)',
    next_action: `Responderle a ${s.person_name.split(/\s+/)[0]} sobre ${s.what}`,
    why_matters: `Lo pidió ella/él mismo el ${s.quote_at.slice(0, 10)}: «${s.quote.slice(0, 300)}»`,
    updated_at: now.toISOString(),
  }, { onConflict: 'id' })
  // PostgREST no lanza: el error viene en `.error` (trampa de #947).
  if (dealErr) return { toast: 'No pude crear la oportunidad, inténtalo desde la app.' }

  await supabase.from('opportunity_signals')
    .update({ state: 'registered', deal_id: dealId, resolved_at: now.toISOString() })
    .eq('user_id', userId).eq('id', signalId)
  return { toast: `💼 Registrada: ${s.what.slice(0, 60)}` }
}

/** "✕ No es negocio" → la señal no vuelve. Tan importante como el sí: sin esto el
 *  detector repetiría lo descartado y se volvería ruido. */
async function opportunityDismiss(
  supabase: SupabaseClient, userId: string, signalId: string, now: Date,
): Promise<BriefActionResult> {
  const { error } = await supabase.from('opportunity_signals')
    .update({ state: 'dismissed', resolved_at: now.toISOString() })
    .eq('user_id', userId).eq('id', signalId)
  if (error) return { toast: 'No pude descartarla.' }
  return { toast: '✕ Listo, no te la vuelvo a mostrar.' }
}

/**
 * "✕ Ya no va" → el paso queda DESCARTADO: ni hecho ni pendiente.
 *
 * Hasta el 5-ago-2026 no existía ningún camino para que Aaron descartara una tarea —
 * ni acá, ni en la app, ni en el chat. Solo un script `.mjs` corrido por alguien más,
 * un objetivo a la vez. Por eso le quedó vivo el paso de Dayana en el objetivo de al
 * lado, y volvía cada mañana.
 *
 * `task_status: null` va junto con el status, igual que en `scripts/descartar-pasos.mjs`:
 * si se deja el `task_status` viejo, `taskStatusPatch()` mapea cualquier valor no-`done`
 * a `pendiente` y la UI RESUCITA el paso en cuanto alguien toca su control de estado.
 * Los dos campos se mueven juntos o el descarte no aguanta.
 */
async function taskDiscard(supabase: SupabaseClient, userId: string, taskId: string): Promise<BriefActionResult> {
  const { data, error } = await supabase
    .from('objective_steps')
    .update({ status: 'descartado', task_status: null })
    .eq('user_id', userId).eq('id', taskId)
    .select('title')
    .maybeSingle()
  if (error || !data) return { toast: 'No pude descartarla, inténtalo desde la app.' }
  return { toast: `✕ Fuera: ${(data as { title: string }).title}`.slice(0, 190) }
}

async function taskRemind(
  supabase: SupabaseClient, userId: string, taskId: string, now: Date,
): Promise<BriefActionResult> {
  const { data: step } = await supabase
    .from('objective_steps').select('title').eq('user_id', userId).eq('id', taskId).maybeSingle()
  const title = (step as { title?: string } | null)?.title
  if (!title) return { toast: 'No encontré esa tarea.' }
  const { error } = await supabase.from('reminders').insert({
    user_id: userId,
    text: title.slice(0, 500),
    due_at: todaySixPmLimaISO(now),
  })
  if (error) return { toast: 'No pude agendar el recordatorio.' }
  return { toast: '⏰ Te lo recuerdo hoy 6pm' }
}

async function momentClose(supabase: SupabaseClient, userId: string, momentId: string): Promise<BriefActionResult> {
  const { data, error } = await supabase
    .from('relationship_moments')
    .update({ status: 'cerrado' })
    .eq('user_id', userId).eq('id', momentId)
    .select('title')
    .maybeSingle()
  if (error || !data) return { toast: 'No pude cerrarlo, inténtalo desde la app.' }
  return { toast: `✅ Cerrado: ${(data as { title: string }).title}`.slice(0, 190) }
}

/**
 * 🔕: el tema deja de aparecer en el brief. Resuelve la `ref` corta del botón
 * contra el log de lo enviado (brief_sent_signals) para obtener el topic_key
 * estable — así el silencio sobrevive a que el texto se reformule.
 */
async function mute(supabase: SupabaseClient, userId: string, ref: string): Promise<BriefActionResult> {
  const { data: sent } = await supabase
    .from('brief_sent_signals')
    .select('topic_key, sample_text, section')
    .eq('user_id', userId).eq('ref', ref)
    .maybeSingle()
  const row = sent as { topic_key: string; sample_text: string; section: string | null } | null
  if (!row?.topic_key) return { toast: 'Ya no tengo esa señal a la mano.' }
  const { error } = await supabase.from('brief_mutes').upsert({
    user_id: userId, topic_key: row.topic_key, sample_text: row.sample_text, section: row.section,
  }, { onConflict: 'user_id,topic_key' })
  if (error) return { toast: 'No pude silenciarlo.' }
  return { toast: '🔕 Listo, no te lo repito más' }
}

/**
 * "✅ Sí, las N" del lote de organizaciones → crea las `org_profiles` y saca esos
 * handles de la bandeja.
 *
 * Los handles NO vienen en el `ref` (Telegram corta `callback_data` en 64 bytes y
 * no caben 30): los recupera el caller del TEXTO del mensaje y los pasa acá. Ver
 * orgBatch.ts.
 *
 * Idempotente por `org_slug`: volver a tocar el botón no duplica nada. Y respeta la
 * jerarquía que Aaron describió —una compañía de bomberos cuelga del CGBVP— vía
 * `inferParentOrg`, que es la razón por la que `org_profiles.parent_org` existe.
 */
export async function orgBatchApply(
  supabase: SupabaseClient, userId: string, handles: string[], now: Date,
): Promise<BriefActionResult> {
  if (handles.length === 0) return { toast: 'Ya no tengo ese lote a la mano.' }

  const { data: existentes } = await supabase
    .from('org_profiles').select('org_slug, instagram_handle').eq('user_id', userId)
  const filas = (existentes ?? []) as Array<{ org_slug: string; instagram_handle: string | null }>
  const slugsExistentes = filas.map((o) => o.org_slug)
  const yaTengo = new Set(filas.map((o) => (o.instagram_handle ?? '').replace(/^@/, '').toLowerCase()).filter(Boolean))

  let creadas = 0, yaEstaban = 0
  for (const handle of handles) {
    if (yaTengo.has(handle)) { yaEstaban++; continue }
    const name = nombreDesdeHandle(handle)
    if (!name) continue
    const slug = orgSlug(name)
    const { error } = await supabase.from('org_profiles').upsert({
      id: `org_${slug}`.slice(0, 60), user_id: userId,
      org_slug: slug, name,
      instagram_handle: handle,
      parent_org: inferParentOrg(name, slugsExistentes),
      source: 'lote de Telegram (confirmado por Aaron)',
      updated_at: now.toISOString(),
    }, { onConflict: 'user_id,org_slug' })
    // PostgREST no lanza: el error viene en `.error`. Una fila que falla no debe
    // abortar el lote — se cuenta como no creada y el handle se queda en la cola.
    if (!error) { creadas++; slugsExistentes.push(slug) }
  }

  // Solo se sacan de la bandeja los que efectivamente quedaron como organización.
  const aLimpiar = handles.filter((h) => yaTengo.has(h) || creadas > 0)
  if (aLimpiar.length > 0) {
    await supabase.from('unmatched_social_activity')
      .delete().eq('user_id', userId).in('handle', aLimpiar)
  }

  // "organización" pierde el acento en plural: organizaciones, no organizaciónes.
  const sustantivo = creadas === 1 ? 'organización registrada' : 'organizaciones registradas'
  const partes = [creadas > 0 ? `🏢 ${creadas} ${sustantivo}` : null]
  if (yaEstaban > 0) partes.push(`${yaEstaban} ya estaban`)
  return { toast: partes.filter(Boolean).join(' · ') || 'No pude registrarlas.' }
}

/** "✕ Ninguna" → se marcan como preguntadas para que el lote no vuelva mañana,
 *  pero NO se borran: siguen siendo handles pendientes de identificar. */
export async function orgBatchDismiss(
  supabase: SupabaseClient, userId: string, handles: string[], now: Date,
): Promise<BriefActionResult> {
  if (handles.length === 0) return { toast: 'Ya no tengo ese lote a la mano.' }
  const { error } = await supabase.from('unmatched_social_activity')
    .update({ asked_at: now.toISOString() })
    .eq('user_id', userId).in('handle', handles)
  if (error) return { toast: 'No pude descartar el lote.' }
  return { toast: '✕ Listo, las dejo pendientes y no te repito este lote.' }
}

/**
 * Ejecuta el botón. `askSirText` lo inyecta el caller (el webhook) para las
 * acciones que necesitan pensar —borrador y próximo paso— y así este módulo no
 * depende del cerebro ni de HTTP. `messageText` lo inyecta también el webhook,
 * para las acciones cuyo estado vive en el texto del mensaje (el lote de orgs).
 */
/**
 * Agenda el encuentro que estaba sin fecha. El tap cierra el loop.
 *
 * ═══ POR QUÉ `personal_events` Y CON LA HORA EN LA NOTA ═════════════════════
 *
 * `gcal-sync` ya sube `personal_events` a Google Calendar, así que esta fila
 * termina en su calendario sin escribir una línea nueva de integración.
 *
 * Y la hora va **en la nota** porque `personal_events.event_date` es un DATE sin
 * hora: el pipeline saca el horario del texto con `rangoHorarioDeNota` y así crea
 * un evento CRONOMETRADO en vez de una banderita de todo el día. Aaron ya reclamó
 * eso con una captura ("mira cómo se ve en el calendario la agenda de la hora").
 * Tiene que ser `HH:MM` en 24 h — verificado: "a las 7 pm" no parsea.
 */
async function agendarEncuentro(
  supabase: SupabaseClient,
  userId: string,
  ref: string,
  now: Date,
): Promise<BriefActionResult> {
  const p = parseRefDeEncuentro(ref)
  if (!p) return { toast: 'No pude leer ese horario.' }
  const { data: per } = await supabase.from('people')
    .select('name').eq('user_id', userId).eq('id', p.personId).maybeSingle()
  const nombre = (per as { name?: string } | null)?.name
  // Sin la persona NO se inventa el evento: sería una cita con nadie.
  if (!nombre) return { toast: 'No encontré a esa persona.' }

  const { error } = await supabase.from('personal_events').insert({
    user_id: userId,
    person_id: p.personId,
    title: `Ver a ${nombre}`,
    event_date: p.diaLima,
    all_day: false,
    // La hora, en 24 h, para que el sync la levante.
    note: `Encuentro acordado con ${nombre} · ${p.horaLima}`,
    source: 'telegram',
  })
  if (error) return { toast: 'No pude agendarlo, intento de nuevo mañana.' }

  // Se apaga el pedido para que no vuelva a preguntar por lo mismo.
  await marcarEncuentroResuelto(supabase, userId, p.personId, now)
  return { toast: `📅 Agendado: ${nombre}, ${p.diaLima} ${p.horaLima}` }
}

/**
 * "Ahora no": no se agenda nada y se calla por 14 días.
 *
 * La salida existe porque un aviso sin salida vuelve cada noche y se convierte en
 * el ruido que Aaron ya ignora. Es el mismo reclamo que dio origen al `✕ Ya no va`.
 */
async function posponerEncuentro(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  now: Date,
): Promise<BriefActionResult> {
  await marcarEncuentroResuelto(supabase, userId, personId, now)
  return { toast: '🔕 Listo, no te lo vuelvo a mencionar por un rato.' }
}

/**
 * Apaga el pedido de encuentro de esa persona. Idempotente.
 *
 * Va a `brief_mutes` y NO a `brief_sent_signals`: la primera es la tabla de "no me
 * lo repitas" y su clave es `(user_id, topic_key)`, que es justo lo que hace falta
 * para un upsert por persona. La segunda tiene clave `(user_id, ref)` — usarla
 * habría hecho fallar el upsert **en silencio** (el `catch` se lo comía) y el aviso
 * volvería cada noche. Es el mismo mecanismo que ya usa el botón 🔕.
 */
export const TOPIC_ENCUENTRO = (personId: string) => `encuentro-sin-fecha:${personId}`

async function marcarEncuentroResuelto(
  supabase: SupabaseClient,
  userId: string,
  personId: string,
  _now: Date,
): Promise<void> {
  try {
    await supabase.from('brief_mutes').upsert({
      user_id: userId,
      topic_key: TOPIC_ENCUENTRO(personId),
      sample_text: 'compromiso de verse sin fecha',
      section: 'gente',
    }, { onConflict: 'user_id,topic_key' })
  } catch {
    // Fail-open: que no se pueda apagar el pedido no debe tumbar el tap.
  }
}

export async function runBriefAction(
  supabase: SupabaseClient,
  userId: string,
  kind: BriefActionKind,
  ref: string,
  opts: { now?: Date; askSirText?: (question: string) => Promise<string>; messageText?: string } = {},
): Promise<BriefActionResult> {
  const now = opts.now ?? new Date()
  try {
    switch (kind) {
      case 'task_done': return await taskDone(supabase, userId, ref)
      case 'habit_done': return await habitDone(supabase, userId, ref, now)
      case 'log_tono': return await logInteraccion(supabase, userId, ref, now)
      case 'task_remind': return await taskRemind(supabase, userId, ref, now)
      case 'task_discard': return await taskDiscard(supabase, userId, ref)
      case 'enc_slot': return await agendarEncuentro(supabase, userId, ref, now)
      case 'enc_no': return await posponerEncuentro(supabase, userId, ref, now)
      case 'moment_close': return await momentClose(supabase, userId, ref)
      case 'mute': return await mute(supabase, userId, ref)
      case 'person_draft': {
        if (!opts.askSirText) return { toast: 'No puedo redactar ahora.' }
        const { data } = await supabase.from('people').select('name').eq('user_id', userId).eq('id', ref).maybeSingle()
        const name = (data as { name?: string } | null)?.name ?? 'esa persona'
        const reply = await opts.askSirText(
          `Escríbeme un mensaje corto, cálido y natural para mandarle a ${name} hoy, en mi voz. `
          + 'Basate en lo último que hablamos y en cómo está la relación. Dame SOLO el mensaje, listo para copiar.',
        )
        return { toast: '✍️ Te paso un borrador', reply }
      }
      case 'goal_next': {
        if (!opts.askSirText) return { toast: 'No puedo pensarlo ahora.' }
        const { data } = await supabase.from('goals').select('title').eq('user_id', userId).eq('id', ref).maybeSingle()
        const title = (data as { title?: string } | null)?.title ?? 'ese objetivo'
        const reply = await opts.askSirText(
          `¿Cuál es el próximo paso CONCRETO para "${title}"? Uno solo, accionable esta semana, `
          + 'con a quién involucra si aplica. Sé breve.',
        )
        return { toast: '🚀 Ahí va el próximo paso', reply }
      }
      case 'doc_sent': {
        // Apagar el reclamo de un entregable. Sin esto el aviso volvería cada
        // mañana para siempre y se convertiría en el ruido que él ya ignora.
        const { data, error } = await supabase.from('documents')
          .update({ status: 'enviado', sent_at: now.toISOString(), updated_at: now.toISOString() })
          .eq('user_id', userId).eq('id', ref)
          .select('title').maybeSingle()
        if (error || !data) return { toast: 'No pude marcarlo, hazlo desde la ficha.' }
        return { toast: `📤 Enviado: ${(data as { title: string }).title.slice(0, 50)}` }
      }
      case 'task_date': {
        // Fechar la tarea que estaba invisible. Determinístico: la fecha viene en
        // la `ref` del botón que él tocó, no de una inferencia.
        const parsed = parseRefDeFecha(ref)
        if (!parsed) return { toast: 'No pude leer esa fecha.' }
        const { data, error } = await supabase.from('objective_steps')
          .update({ target_date: parsed.iso })
          .eq('user_id', userId).eq('id', parsed.stepId)
          .select('title').maybeSingle()
        if (error || !data) return { toast: 'No pude fecharla, inténtalo desde la app.' }
        const t = (data as { title: string }).title
        return { toast: `📅 ${etiquetaDeFecha(parsed.iso)} — ${t.slice(0, 40)}` }
      }
      case 'goal_plan': {
        // Traer el PLAN, no la pregunta. Aaron tiene 5 metas activas con cero
        // tareas y se lo planteé dos veces sin que cerrara, porque lo que le
        // llevaba era el problema. Acá toca un botón y quedan los pasos escritos.
        if (!opts.askSirText) return { toast: 'No puedo armarlo ahora.' }
        const { data, error } = await supabase.from('goals')
          .select('title, why, target, target_date, description')
          .eq('user_id', userId).eq('id', ref).maybeSingle()
        if (error) return { toast: 'No pude leer la meta.' }
        const g = (data ?? null) as null | Record<string, unknown>
        if (!g) return { toast: 'Esa meta ya no está.' }
        const limite = g.target_date ? ` El límite es ${String(g.target_date).slice(0, 10)}.` : ''
        const texto = await opts.askSirText(
          `Mi objetivo es "${g.title}".${g.target ? ` La meta concreta: ${String(g.target).slice(0, 150)}.` : ''}`
          + `${g.why ? ` Por qué me importa: ${String(g.why).slice(0, 200)}.` : ''}${limite}`
          + ` Dame entre 3 y ${MAX_PASOS} primeros pasos CONCRETOS y accionables, en orden.`
          + ' Formato EXACTO, una línea por paso y nada más:'
          + ' N. <qué hacer, empezando con un verbo> | <en cuántos días desde hoy>'
          + ' Sin introducción, sin cierre, sin viñetas. Cada paso tiene que poder'
          + ' hacerse en una sentada; nada de "definir la estrategia".',
        )
        const propuestos = parsePlanPropuesto(texto ?? '')
        // Si el formato no vino claro NO se escribe nada: se le muestra el texto y
        // decide él. Escribir un parseo dudoso le ensuciaría el plan de verdad.
        if (propuestos.length === 0) {
          return { toast: '🎯 Te propongo esto (no lo guardé)', reply: texto ?? 'No me salió un plan claro. Pídemelo por el chat.' }
        }
        const hoy = todayLimaKey(now.getTime())
        const filas = propuestos.map((p, i) => ({
          user_id: userId,
          objective_id: ref,
          title: p.title,
          kind: 'task',
          status: 'pendiente',
          sort_order: i,
          target_date: fechaEnDias(hoy, p.enDias),
          description: 'Propuesto por SIR el ' + hoy + ' desde el brief. Bórralo si no va.',
        }))
        const { error: insErr } = await supabase.from('objective_steps').insert(filas)
        if (insErr) return { toast: 'No pude guardarlos', reply: texto ?? undefined }
        const lista = propuestos.map((p, i) => `${i + 1}. ${p.title} — ${fechaEnDias(hoy, p.enDias)}`).join('\n')
        return {
          toast: `🚀 Cargué ${propuestos.length} pasos`,
          reply: `Listo, "${String(g.title).slice(0, 60)}" ya tiene plan:\n\n${lista}\n\nBorra el que no vaya.`,
        }
      }
      case 'deal_prep': {
        // El pedido CONCRETO para un encuentro que ya va a pasar. Distinto de
        // `person_draft` a propósito: ahí SIR escribe un mensaje cálido para
        // mandar; acá Aaron ya va a estar frente a la persona y lo que necesita
        // es QUÉ pedirle y cómo aterrizarlo, no un saludo.
        if (!opts.askSirText) return { toast: 'No puedo prepararlo ahora.' }
        const { data, error } = await supabase
          .from('deals')
          .select('title, client_org, stage, next_action, amount, currency, scope, notes, contact_person_id')
          .eq('user_id', userId).eq('id', ref).maybeSingle()
        if (error) return { toast: 'No pude leer la oportunidad.' }
        const d = (data ?? null) as null | Record<string, unknown>
        if (!d) return { toast: 'Esa oportunidad ya no está.' }
        let quien = 'esa persona'
        if (d.contact_person_id) {
          const { data: p } = await supabase.from('people').select('name')
            .eq('user_id', userId).eq('id', d.contact_person_id as string).maybeSingle()
          quien = ((p as { name?: string } | null)?.name) ?? quien
        }
        const monto = d.amount ? ` Valor estimado: ${d.currency ?? ''} ${d.amount}.` : ''
        const reply = await opts.askSirText(
          `Voy a cruzarme con ${quien} y tengo con ella la oportunidad "${d.title}"`
          + `${d.client_org ? ` (${d.client_org})` : ''}, en etapa "${d.stage}".`
          + `${d.next_action ? ` Lo que sigue es: ${String(d.next_action).slice(0, 200)}.` : ''}`
          + `${d.scope ? ` Alcance: ${String(d.scope).slice(0, 200)}.` : ''}${monto}`
          + ' Dame EXACTAMENTE: (1) la frase con la que le saco el tema sin que suene a venta,'
          + ' (2) las 2 preguntas que necesito que me responda para poder avanzar,'
          + ' (3) el compromiso concreto con el que quiero cerrar la conversación.'
          + ' Breve, en mi voz, listo para usar hoy. Nada de teoría de ventas.',
        )
        return { toast: `🎯 Qué pedirle a ${quien.split(/\s+/)[0]}`, reply }
      }
      case 'opp_reg': return await opportunityRegister(supabase, userId, ref, now)
      case 'opp_no': return await opportunityDismiss(supabase, userId, ref, now)
      // El lote de organizaciones lleva su estado en el TEXTO del mensaje, no en
      // el ref: 30 handles no caben en los 64 bytes del callback_data.
      case 'org_ok': return await orgBatchApply(supabase, userId, parseOrgBatch(opts.messageText ?? ''), now)
      case 'org_no': return await orgBatchDismiss(supabase, userId, parseOrgBatch(opts.messageText ?? ''), now)
      default: return { toast: 'No sé hacer eso todavía.' }
    }
  } catch {
    return { toast: 'Algo falló, inténtalo de nuevo.' }
  }
}
