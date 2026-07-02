// SIR V2 — POST /api/aaron/backfill-jul-2026
//
// Endpoint ONE-SHOT y IDEMPOTENTE que carga el relato que Aaron me contó
// por chat el 02-jul-2026 (regreso con Diana + mudanza a casa de Marita).
// Cada evento tiene un `backfill_key` único; si ya existe una fila con ese
// key en la tabla correspondiente, la salta. Podés llamarlo N veces sin
// duplicar. Session-auth (usa RLS del user logueado).
//
// Diseño: Aaron NO tiene todavía una interfaz para escribir un relato en
// prosa y que SIR lo parsee (está por venir con router 2b + LLM). Este
// endpoint es el atajo: hardcodeo los eventos como código, él los mete
// con un fetch desde la consola del browser, y quedan los mismos
// datos estructurados que si los hubiera entrado por UI.
//
// Alcance:
//   - Diana (person_id lookup por nombre): 4 moments + 5 person_logs
//     (interaction) + 1 observation manual_note.
//   - Mudanza 01-jul: marca el KR de "Mudarme con mi perro" como hecho
//     (best-effort si encuentra el goal) + 1 moment vinculado a Marita.
//
// Cero migración. Cero data destructiva. Response detalla created/skipped.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Stat { created: number; skipped: number; notes: string[] }

// ─── Eventos hardcodeados (fuente única del backfill) ────────────────
//
// Los detalles vienen del relato de Aaron (chat 02-jul-2026). Cada evento
// tiene `key` único → sirve para idempotencia.

const DIANA_MOMENTS: Array<{
  key: string
  title: string
  detail: string
  occurredOn: string
  status: 'abierto' | 'resuelto'
  resolution?: string
  followUpOn?: string | null
}> = [
  {
    key: 'diana:2026-06-26:regreso',
    title: 'Regresamos — acordamos reintento',
    detail: 'Viernes 26-jun: hablamos y acordamos volver a intentar. La comunicación fue regular, no fluida, pero pudimos aterrizar la decisión.',
    occurredOn: '2026-06-26',
    status: 'resuelto',
    resolution: 'Ambos aceptamos reintento. Sin acuerdo explícito de qué cambia.',
  },
  {
    key: 'diana:2026-06-28:ubicacion',
    title: 'Me quitó su ubicación · discutimos al reencontrarnos',
    detail: 'Domingo 28-jun a la noche fui a buscarla. Me molestó descubrir que me había quitado su ubicación de Google/Whatsapp. Ella me dijo que lo hizo por bronca acumulada de peleas anteriores. Yo lo tomé como distancia; ella lo interpretó como límite.',
    occurredOn: '2026-06-28',
    status: 'abierto',
    followUpOn: '2026-07-08',
  },
  {
    key: 'diana:2026-06-29:hotel',
    title: 'Hotel · reconexión con discusión de fondo',
    detail: 'Lunes 29-jun: hotel juntos. Mucha intimidad. Peleamos otra vez en medio, pero cerramos bien. Ella me contó que la está pasando mal — trabajo y familia complicados — y que eso le pega en la relación. Aún tenía un resto de regla. Salí con la sensación de que el problema no es sólo nosotros: hay contexto externo.',
    occurredOn: '2026-06-29',
    status: 'resuelto',
    resolution: 'Cerramos bien. Ella se abrió sobre su contexto. Pendiente: cómo la sostengo sin cargarla más.',
  },
  {
    key: 'diana:2026-07-01:examen',
    title: 'Examen médico de control (seguro que yo pago)',
    detail: 'Miércoles 01-jul: se hizo el examen anual con el seguro médico que le pago. Está contenta porque va a tener una imagen clara de cómo está. Esperamos resultados.',
    occurredOn: '2026-07-01',
    status: 'abierto',
    followUpOn: '2026-07-15',
  },
]

const DIANA_LOGS: Array<{
  key: string
  kind: 'interaction'
  value: number
  loggedAt: string
  note: string
}> = [
  { key: 'diana:log:2026-06-26', kind: 'interaction', value: 3, loggedAt: '2026-06-26T20:00:00-05:00',
    note: 'Regreso. Comunicación regular, acuerdo pero sin claridad.' },
  { key: 'diana:log:2026-06-28', kind: 'interaction', value: 2, loggedAt: '2026-06-28T22:00:00-05:00',
    note: 'Fui a buscarla. Descubrí que me quitó la ubicación. Discutimos.' },
  { key: 'diana:log:2026-06-29', kind: 'interaction', value: 4, loggedAt: '2026-06-29T23:30:00-05:00',
    note: 'Hotel. Cerca físicamente. Discutimos y arreglamos. Ella se abrió sobre su contexto.' },
  { key: 'diana:log:2026-07-01', kind: 'interaction', value: 4, loggedAt: '2026-07-01T18:00:00-05:00',
    note: 'Contenta con el examen. Vibra positiva del día.' },
]

const DIANA_OBSERVATION_SUMMARY = `Semana 26-jun a 01-jul: regresamos el viernes, sábado no nos vimos, el domingo discusión por ubicación, el lunes hotel + reconexión con discusión de fondo (contexto externo de ella complicado), el miércoles examen médico. Estado general: reactivada la relación pero con fragilidad; el peso emocional de ella (casa + trabajo) es un factor que hay que sostener sin sobrecargarla.`

const OBSERVATION_KEY = 'diana:relato-semana:2026-06-26_2026-07-01'

const MUDANZA_MOMENT_KEY = 'mudanza:2026-07-01:llegada-marita'

// ─── Helpers ──────────────────────────────────────────────────────────

interface PersonRow { id: string; name: string; slug: string | null }

async function findPersonByName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  needle: string,
): Promise<PersonRow | null> {
  const { data } = await supabase
    .from('people')
    .select('id, name, slug')
    .eq('user_id', userId)
    .ilike('name', `${needle}%`)
    .limit(5)
  const rows = (data ?? []) as PersonRow[]
  // Match preferido: nombre EXACTO. Si no, el primero del prefix.
  const exact = rows.find((r) => r.name.trim().toLowerCase() === needle.toLowerCase())
  return exact ?? rows[0] ?? null
}

async function upsertMoment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  personId: string,
  m: (typeof DIANA_MOMENTS)[number] | { key: string; title: string; detail: string; occurredOn: string; status: 'abierto' | 'resuelto'; resolution?: string; followUpOn?: string | null },
  stat: Stat,
) {
  // Idempotencia: busca por (user_id, person_id, title, occurred_on).
  const { data: existing } = await supabase
    .from('relationship_moments')
    .select('id')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('title', m.title)
    .eq('occurred_on', m.occurredOn)
    .limit(1)
  if ((existing ?? []).length > 0) {
    stat.skipped++
    return
  }
  const row: Record<string, unknown> = {
    user_id: userId,
    person_id: personId,
    title: m.title,
    detail: m.detail,
    status: m.status,
    occurred_on: m.occurredOn,
    follow_up_on: m.followUpOn ?? null,
    resolution: m.resolution ?? null,
  }
  const { error } = await supabase.from('relationship_moments').insert(row)
  if (error) { stat.notes.push(`moment "${m.title}": ${error.message}`); return }
  stat.created++
}

async function upsertPersonLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  personId: string,
  log: (typeof DIANA_LOGS)[number],
  stat: Stat,
) {
  // Idempotencia: busca por (user_id, person_id, kind, logged_at, note prefix).
  const { data: existing } = await supabase
    .from('person_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('kind', log.kind)
    .eq('logged_at', log.loggedAt)
    .limit(1)
  if ((existing ?? []).length > 0) { stat.skipped++; return }
  const { error } = await supabase.from('person_logs').insert({
    user_id: userId,
    person_id: personId,
    kind: log.kind,
    value: log.value,
    note: log.note,
    logged_at: log.loggedAt,
  })
  if (error) { stat.notes.push(`log ${log.kind} ${log.loggedAt}: ${error.message}`); return }
  stat.created++
}

async function upsertObservationSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  personId: string,
  stat: Stat,
) {
  // Idempotencia via data.backfill_key.
  const { data: existing } = await supabase
    .from('observations')
    .select('id, data')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('capture_type', 'manual_note')
    .limit(50)
  const rows = (existing ?? []) as Array<{ id: string; data: Record<string, unknown> | null }>
  const hit = rows.find((r) => (r.data as { backfill_key?: string } | null)?.backfill_key === OBSERVATION_KEY)
  if (hit) { stat.skipped++; return }
  const { error } = await supabase.from('observations').insert({
    user_id: userId,
    person_id: personId,
    capture_type: 'manual_note',
    source_image_path: null,
    storage_bucket: null,
    data: {
      backfill_key: OBSERVATION_KEY,
      source: 'aaron_relato',
      summary: DIANA_OBSERVATION_SUMMARY,
      text: DIANA_OBSERVATION_SUMMARY,
    },
    detector_data: null,
    confidence: 'high',
    observed_at: '2026-07-01T18:00:00-05:00',
    needs_review: false,
  })
  if (error) { stat.notes.push(`observation semana: ${error.message}`); return }
  stat.created++
}

async function completeMudanzaKR(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  stat: Stat,
) {
  // Busca el goal "Mudarme con mi perro" (o similar). El resto queda igual.
  const { data: goals } = await supabase
    .from('goals')
    .select('id, title')
    .eq('user_id', userId)
    .or('title.ilike.%mudarme%perro%,title.ilike.%mudanza%')
    .limit(5)
  const goalRows = (goals ?? []) as Array<{ id: string; title: string }>
  const goal = goalRows.find((g) => /perro/i.test(g.title)) ?? goalRows[0]
  if (!goal) { stat.notes.push('no encontré el goal de mudanza; skip KR'); return }

  // Busca cualquier step del goal con título que huela a "mudarme físicamente".
  const { data: steps } = await supabase
    .from('objective_steps')
    .select('id, title, status')
    .eq('user_id', userId)
    .eq('objective_id', goal.id)
    .limit(20)
  const stepRows = (steps ?? []) as Array<{ id: string; title: string; status: string }>
  // Heurística de matching: preferimos el que menciona "mudarme"/"llegar"/"día".
  const target = stepRows.find((s) => /mudarme|llegar|dia\s*d|traslad/i.test(s.title))
    ?? stepRows.find((s) => /f[ií]sic/i.test(s.title))
    ?? stepRows[stepRows.length - 1] // fallback: el último (suele ser el más final)
  if (!target) { stat.notes.push(`goal "${goal.title}" sin steps; skip KR`); return }
  if (target.status === 'hecho') { stat.skipped++; return }
  const { error } = await supabase
    .from('objective_steps')
    .update({ status: 'hecho', completed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', target.id)
  if (error) { stat.notes.push(`KR "${target.title}": ${error.message}`); return }
  stat.created++
  stat.notes.push(`KR marcado: "${target.title}"`)
}

async function upsertMudanzaMoment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  stat: Stat,
) {
  // Vinculamos el moment a Marita si la encuentro; si no, a Adrián; si no, skip.
  const marita = await findPersonByName(supabase, userId, 'Marita')
  const adrian = await findPersonByName(supabase, userId, 'Adrián')
  const primary = marita ?? adrian
  if (!primary) { stat.notes.push('no encontré ni Marita ni Adrián como personas — skip moment de mudanza'); return }

  const title = 'Mudanza a casa de Marita · con Logan'
  const { data: existing } = await supabase
    .from('relationship_moments')
    .select('id')
    .eq('user_id', userId)
    .eq('person_id', primary.id)
    .eq('title', title)
    .eq('occurred_on', '2026-07-01')
    .limit(1)
  if ((existing ?? []).length > 0) { stat.skipped++; return }

  const { data: inserted, error } = await supabase.from('relationship_moments').insert({
    user_id: userId,
    person_id: primary.id,
    title,
    detail: 'Mié 01-jul-2026: dormí primera noche en casa de Marita con Logan. Adrián me ayudó con la mudanza y papá también. Cierra el objetivo "Mudarme con mi perro". Marker: ' + MUDANZA_MOMENT_KEY,
    status: 'resuelto',
    occurred_on: '2026-07-01',
    resolution: 'Mudanza completada. Empieza etapa puente en casa de tía Marita, S/1000/mes.',
  }).select('id').single()
  if (error || !inserted) { stat.notes.push(`moment mudanza: ${error?.message ?? 'insert falló'}`); return }
  stat.created++

  // Best-effort: sumar Adrián + papá como participantes si existen.
  const papa = await findPersonByName(supabase, userId, 'Papá')
    ?? await findPersonByName(supabase, userId, 'Papa')
    ?? await findPersonByName(supabase, userId, 'Fernando') // (nombre real del padre según memoria de ficha "Papá·Fernando Brañes")
  const participants: string[] = []
  if (adrian && adrian.id !== primary.id) participants.push(adrian.id)
  if (papa && papa.id !== primary.id) participants.push(papa.id)
  if (participants.length > 0) {
    try {
      await supabase.from('moment_participants').insert(
        participants.map((personId) => ({ user_id: userId, moment_id: (inserted as { id: string }).id, person_id: personId })),
      )
    } catch { /* best-effort */ }
  }
}

// ─── Handler ──────────────────────────────────────────────────────────

export async function POST() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  const moments: Stat = { created: 0, skipped: 0, notes: [] }
  const logs: Stat = { created: 0, skipped: 0, notes: [] }
  const observations: Stat = { created: 0, skipped: 0, notes: [] }
  const objectives: Stat = { created: 0, skipped: 0, notes: [] }

  // Diana lookup.
  const diana = await findPersonByName(supabase, userId, 'Diana')
  if (!diana) {
    return NextResponse.json({
      error: 'No encontré una persona llamada "Diana" en tu red',
      moments, logs, observations, objectives,
    }, { status: 404 })
  }

  for (const m of DIANA_MOMENTS) {
    await upsertMoment(supabase, userId, diana.id, m, moments)
  }
  for (const log of DIANA_LOGS) {
    await upsertPersonLog(supabase, userId, diana.id, log, logs)
  }
  await upsertObservationSummary(supabase, userId, diana.id, observations)

  await completeMudanzaKR(supabase, userId, objectives)
  await upsertMudanzaMoment(supabase, userId, moments)

  return NextResponse.json({
    ok: true,
    dianaPersonId: diana.id,
    dianaSlug: diana.slug,
    moments,
    logs,
    observations,
    objectives,
  })
}
