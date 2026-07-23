// SIR V2 — Ejecutor de acciones validadas de /api/relato/ingest.
//
// Recibe el user_id + una lista de acciones (ya parseadas por tools.ts) y las
// escribe contra Supabase. Sesión-auth: el cliente debe traer las cookies de
// Aaron. Cada acción es idempotente por firma "razonable" — si ya existe una
// row con misma persona + título + fecha, se salta.
//
// Person lookup: por nombre completo case/accent-insensitive. Si no encuentra,
// devuelve error para esa acción (NO crea silenciosamente). El caller decide.

import type { createClient } from '@/lib/supabase/server'
import { ensureFreshGoogleToken } from '@/lib/calendar/oauth/session'
import { createGoogleEvent } from '@/lib/calendar/oauth/google'
import type { IngestAction } from './tools'

type Supabase = Awaited<ReturnType<typeof createClient>>

export interface ExecResult {
  action: IngestAction
  ok: boolean
  error?: string
  createdId?: string
}

/** Normaliza para lookup (sin acentos, minúsculas, whitespace colapsado). */
function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

async function findPersonByFullName(supabase: Supabase, userId: string, fullName: string): Promise<{ id: string; name: string } | null> {
  const needle = norm(fullName)
  const { data } = await supabase
    .from('people')
    .select('id, name')
    .eq('user_id', userId)
    .limit(500)
  const rows = (data ?? []) as Array<{ id: string; name: string }>
  return rows.find((r) => norm(r.name) === needle) ?? null
}

/** Devuelve el nombre de persona referenciada por la acción, o null si no aplica. */
function personRefOf(action: IngestAction): string | null {
  if (action.kind === 'flag_ambiguo') return null
  if (action.kind === 'crear_objetivo') return null // no persona
  if (action.kind === 'crear_persona') return null // crea, no busca
  if (action.kind === 'registrar_aprendizaje') return null // lección sobre Aaron, sin persona
  if (action.kind === 'crear_recordatorio') return action.personFullName ?? null // opcional
  if (action.kind === 'avanzar_objetivo') return null // se resuelve por título de meta
  if (action.kind === 'crear_evento_calendario') return null // evento propio, sin persona
  return action.personFullName
}

async function execOne(supabase: Supabase, userId: string, action: IngestAction): Promise<ExecResult> {
  const personRef = personRefOf(action)
  const person = personRef ? await findPersonByFullName(supabase, userId, personRef) : null

  // Persona opcional (recordatorios): si no existe, seguimos sin ella.
  if (personRef && !person && action.kind !== 'crear_recordatorio') {
    return { action, ok: false, error: `Persona "${personRef}" no está en tu red.` }
  }

  try {
    if (action.kind === 'crear_moment' && person) {
      const { data: existing } = await supabase
        .from('relationship_moments')
        .select('id')
        .eq('user_id', userId).eq('person_id', person.id)
        .eq('title', action.title).eq('occurred_on', action.occurredOn)
        .limit(1)
      if ((existing ?? []).length > 0) {
        return { action, ok: true, createdId: ((existing ?? [])[0] as { id: string }).id, error: 'ya existía (idempotente)' }
      }
      const { data, error } = await supabase.from('relationship_moments').insert({
        user_id: userId, person_id: person.id, title: action.title, detail: action.detail,
        status: action.status, occurred_on: action.occurredOn,
        follow_up_on: action.followUpOn ?? null, resolution: action.resolution ?? null,
      }).select('id').single()
      if (error) return { action, ok: false, error: error.message }
      return { action, ok: true, createdId: (data as { id: string }).id }
    }

    if (action.kind === 'crear_person_log' && person) {
      const { data: existing } = await supabase
        .from('person_logs').select('id')
        .eq('user_id', userId).eq('person_id', person.id)
        .eq('kind', action.logKind).eq('logged_at', action.loggedAt).limit(1)
      if ((existing ?? []).length > 0) {
        return { action, ok: true, error: 'ya existía (idempotente)', createdId: ((existing ?? [])[0] as { id: string }).id }
      }
      const { data, error } = await supabase.from('person_logs').insert({
        user_id: userId, person_id: person.id, kind: action.logKind,
        value: action.value, note: action.note, logged_at: action.loggedAt,
      }).select('id').single()
      if (error) return { action, ok: false, error: error.message }
      return { action, ok: true, createdId: (data as { id: string }).id }
    }

    if (action.kind === 'crear_nota_manual' && person) {
      // Idempotencia: misma persona + mismo texto ya anotado → se salta (evita
      // duplicar la nota en la bitácora si Aaron reprocesa el mismo relato).
      const { data: existing } = await supabase
        .from('observations').select('id')
        .eq('user_id', userId).eq('person_id', person.id)
        .eq('capture_type', 'manual_note')
        .eq('data->>text', action.text).limit(1)
      if ((existing ?? []).length > 0) {
        return { action, ok: true, error: 'ya existía (idempotente)', createdId: ((existing ?? [])[0] as { id: string }).id }
      }
      const { data, error } = await supabase.from('observations').insert({
        user_id: userId, person_id: person.id,
        capture_type: 'manual_note',
        source_image_path: null, storage_bucket: null,
        data: { source: 'relato_ingest', text: action.text, summary: action.text },
        detector_data: null, confidence: 'high',
        observed_at: action.observedAt, needs_review: false,
      }).select('id').single()
      if (error) return { action, ok: false, error: error.message }
      return { action, ok: true, createdId: (data as { id: string }).id }
    }

    if (action.kind === 'registrar_aprendizaje') {
      // Dedup ligero: si ya existe una lección activa con el MISMO texto (normalizado),
      // la reforzamos (reinforced_count++) en vez de duplicar.
      const needle = norm(action.text)
      const { data: existing } = await supabase
        .from('learnings').select('id, text, reinforced_count')
        .eq('user_id', userId).eq('is_active', true).limit(200)
      const hit = ((existing ?? []) as Array<{ id: string; text: string; reinforced_count: number }>)
        .find((r) => norm(r.text) === needle)
      if (hit) {
        await supabase.from('learnings')
          .update({ reinforced_count: (hit.reinforced_count ?? 1) + 1, updated_at: new Date().toISOString() })
          .eq('id', hit.id).eq('user_id', userId)
        return { action, ok: true, createdId: hit.id, error: 'reforzada (ya la sabía)' }
      }
      const { data, error } = await supabase.from('learnings').insert({
        user_id: userId, text: action.text, kind: action.learningKind,
        source: 'relato', confidence: action.confidence,
      }).select('id').single()
      if (error) return { action, ok: false, error: error.message }
      return { action, ok: true, createdId: (data as { id: string }).id }
    }

    if (action.kind === 'registrar_ciclo' && person) {
      // Upsert por (user_id, person_id, date) — mig 0110 unique index.
      const { data, error } = await supabase.from('person_cycles').upsert({
        user_id: userId,
        person_id: person.id,
        date: action.date,
        phase: action.phase,
        confidence: action.confidence,
        source: 'aaron',
        note: action.note ?? null,
      }, { onConflict: 'user_id,person_id,date' }).select('id').single()
      if (error) return { action, ok: false, error: error.message }
      return { action, ok: true, createdId: (data as { id: string }).id }
    }

    if (action.kind === 'upsert_cumpleanos' && person) {
      const { data: row } = await supabase
        .from('people').select('id, special_dates')
        .eq('user_id', userId).eq('id', person.id).single()
      const current = ((row?.special_dates as Array<{ id?: string; label?: string; date?: string }> | null) ?? [])
      const already = current.find((d) => d.date?.slice(5) === action.date.slice(5) && /cumple|birthday|nacim/i.test(d.label ?? ''))
      if (already) return { action, ok: true, error: 'cumple ya cargado' }
      const id = `bd-${person.id}-${Date.now()}`
      const next = [...current, { id, label: 'Cumpleaños', date: action.date, recurring: true }]
      const { error } = await supabase.from('people').update({ special_dates: next, updated_at: new Date().toISOString() })
        .eq('user_id', userId).eq('id', person.id)
      if (error) return { action, ok: false, error: error.message }
      return { action, ok: true, createdId: id }
    }

    if (action.kind === 'crear_objetivo') {
      // Idempotencia por (user, title) — evita duplicar si Aaron reprocesa.
      const { data: existing } = await supabase.from('goals').select('id')
        .eq('user_id', userId).ilike('title', action.title).limit(1)
      if ((existing ?? []).length > 0) {
        return { action, ok: true, error: 'ya existía (idempotente)', createdId: ((existing ?? [])[0] as { id: string }).id }
      }
      const { data, error } = await supabase.from('goals').insert({
        user_id: userId, title: action.title,
        category: action.category, priority: action.priority,
        status: 'active',
        target_date: action.targetDate ?? null,
        next_action: action.nextStep ?? '',
        description: action.nextStep ?? '',
      }).select('id').single()
      if (error) return { action, ok: false, error: error.message }
      return { action, ok: true, createdId: (data as { id: string }).id }
    }

    if (action.kind === 'crear_persona') {
      // Idempotencia por (user, name).
      const { data: existing } = await supabase.from('people').select('id')
        .eq('user_id', userId).ilike('name', action.fullName).limit(1)
      if ((existing ?? []).length > 0) {
        return { action, ok: true, error: 'ya existía (idempotente)', createdId: ((existing ?? [])[0] as { id: string }).id }
      }
      const slug = action.fullName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 60)
      const { data, error } = await supabase.from('people').insert({
        user_id: userId, name: action.fullName, slug,
        relationship: action.relationship,
        category: action.category,
        importance_score: action.category === 'inner_circle' ? 9 : action.category === 'close' ? 7 : action.category === 'network' ? 5 : 3,
        notes: action.notes ?? null,
      }).select('id').single()
      if (error) return { action, ok: false, error: error.message }
      return { action, ok: true, createdId: (data as { id: string }).id }
    }

    if (action.kind === 'crear_recordatorio') {
      // Idempotencia: mismo texto + misma fecha/hora → se salta (no repetir el
      // recordatorio si el relato se reprocesa).
      const { data: existing } = await supabase
        .from('reminders').select('id')
        .eq('user_id', userId).eq('text', action.text).eq('due_at', action.dueAt).limit(1)
      if ((existing ?? []).length > 0) {
        return { action, ok: true, error: 'ya existía (idempotente)', createdId: ((existing ?? [])[0] as { id: string }).id }
      }
      const { data, error } = await supabase.from('reminders').insert({
        user_id: userId,
        text: action.text,
        due_at: action.dueAt,
        related_person_id: person?.id ?? null,
      }).select('id').single()
      if (error) return { action, ok: false, error: error.message }
      return { action, ok: true, createdId: (data as { id: string }).id }
    }

    if (action.kind === 'avanzar_objetivo') {
      // Buscar la meta por título (aproximado). Si no hay, error (no crear meta acá).
      const { data: goals } = await supabase
        .from('goals').select('id, title')
        .eq('user_id', userId).limit(300)
      const needle = norm(action.goalTitle)
      const goalRows = (goals ?? []) as Array<{ id: string; title: string }>
      const goal =
        goalRows.find((g) => norm(g.title) === needle) ??
        goalRows.find((g) => norm(g.title).includes(needle) || needle.includes(norm(g.title)))
      if (!goal) return { action, ok: false, error: `No encontré una meta que matchee "${action.goalTitle}".` }

      // ¿El paso ya existe en esa meta? (match por título aproximado.)
      const { data: steps } = await supabase
        .from('objective_steps').select('id, title, status')
        .eq('user_id', userId).eq('objective_id', goal.id).limit(300)
      const sNeedle = norm(action.stepTitle)
      const step = ((steps ?? []) as Array<{ id: string; title: string; status: string }>)
        .find((s) => norm(s.title) === sNeedle || norm(s.title).includes(sNeedle) || sNeedle.includes(norm(s.title)))

      const status = action.done ? 'hecho' : 'en_progreso'
      const taskStatus = action.done ? 'done' : 'in_progress'
      const completedAt = action.done ? new Date().toISOString() : null

      if (step) {
        if (step.status === 'hecho' && action.done) {
          return { action, ok: true, createdId: step.id, error: 'el paso ya estaba hecho (idempotente)' }
        }
        const { error } = await supabase.from('objective_steps')
          .update({ status, task_status: taskStatus, completed_at: completedAt })
          .eq('id', step.id).eq('user_id', userId)
        if (error) return { action, ok: false, error: error.message }
        return { action, ok: true, createdId: step.id }
      }
      // No existía → lo creamos ya avanzado.
      const { data, error } = await supabase.from('objective_steps').insert({
        user_id: userId, objective_id: goal.id, title: action.stepTitle.slice(0, 200),
        status, task_status: taskStatus, kind: 'task', completed_at: completedAt, sort_order: 0,
      }).select('id').single()
      if (error) return { action, ok: false, error: error.message }
      return { action, ok: true, createdId: (data as { id: string }).id }
    }

    if (action.kind === 'crear_evento_calendario') {
      const fresh = await ensureFreshGoogleToken(supabase, userId)
      if (!fresh) return { action, ok: false, error: 'No tienes Google Calendar conectado (o el acceso caducó). Conéctalo y reintento.' }
      try {
        const ev = await createGoogleEvent(fresh.token, {
          title: action.title,
          start: action.start,
          end: action.end,
          allDay: action.allDay,
          location: action.location,
          description: action.description,
        })
        return { action, ok: true, createdId: ev.id, error: ev.htmlLink ? `evento creado: ${ev.htmlLink}` : undefined }
      } catch (e) {
        return { action, ok: false, error: e instanceof Error ? e.message : 'No pude crear el evento en Google.' }
      }
    }

    if (action.kind === 'flag_ambiguo') {
      // No se ejecuta — se surface en el response como warning.
      return { action, ok: false, error: `Ambigüedad: aclaraste "${action.shortName}" pero necesito nombre completo.` }
    }

    return { action, ok: false, error: 'acción no soportada' }
  } catch (e) {
    return { action, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Ejecuta la lista completa en serie (respeta orden del plan). */
export async function executeActions(supabase: Supabase, userId: string, actions: IngestAction[]): Promise<ExecResult[]> {
  const results: ExecResult[] = []
  for (const a of actions) {
    results.push(await execOne(supabase, userId, a))
  }
  return results
}
