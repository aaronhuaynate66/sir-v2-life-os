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

async function execOne(supabase: Supabase, userId: string, action: IngestAction): Promise<ExecResult> {
  const person = action.kind === 'flag_ambiguo'
    ? null
    : await findPersonByFullName(supabase, userId, action.personFullName)

  if (action.kind !== 'flag_ambiguo' && !person) {
    return { action, ok: false, error: `Persona "${action.personFullName}" no está en tu red.` }
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
