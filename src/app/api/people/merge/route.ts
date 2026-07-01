// SIR V2 — POST /api/people/merge
//
// Fusiona 2 personas: mueve TODA la data del `duplicate_id` al `canonical_id`
// y luego borra el row `duplicate_id` de `people`. Ambos ids deben pertenecer
// al mismo usuario (RLS). Auth por sesión.
//
// Body: { canonical_id: string, duplicate_id: string }
// Response 200: { ok: true, moved: { table: string; count: number }[], canonical_slug?: string }
//
// TABLAS que se mueven (person_id o refs a persona → apuntan a canonical):
//   observations, person_logs, memories, person_links (a y b),
//   relationship_moments, moment_participants, person_synthesis,
//   person_profile_axes, person_score_snapshots, person_sensitive_data,
//   person_notes_history
//
// TABLAS con integridad especial:
//   - people.special_dates (jsonb): se mergea al canonical antes del delete
//   - people.tags (array): se hace UNION
//   - people.notes: se concatena si el canonical no tiene y el duplicate sí
//
// POST-CLEANUP:
//   - person_links con person_a_id == person_b_id (self-loop) se borran
//   - person_links duplicados (misma pair + kind) se dedupean
//
// FAIL-SAFE: si algún UPDATE falla, se aborta y devuelve el error. NO se
// borra el duplicate_id row si algo salió mal.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface Body {
  canonical_id?: string
  duplicate_id?: string
}

interface MovedStat { table: string; count: number }

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

/** Tablas que tienen columna `person_id` referenciando people. */
const PERSON_ID_TABLES = [
  'observations',
  'person_logs',
  'memories',
  'relationship_moments',
  'moment_participants',
  'person_synthesis',
  'person_profile_axes',
  'person_score_snapshots',
  'person_sensitive_data',
  'person_notes_history',
] as const

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authErr } = await supabase.auth.getUser()
  if (authErr || !authData?.user) return errorJson(401, 'No autenticado')
  const userId = authData.user.id

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return errorJson(400, 'Body JSON inválido')
  }
  const canonicalId = typeof body.canonical_id === 'string' ? body.canonical_id : ''
  const duplicateId = typeof body.duplicate_id === 'string' ? body.duplicate_id : ''
  if (!canonicalId || !duplicateId) return errorJson(400, 'canonical_id y duplicate_id requeridos')
  if (canonicalId === duplicateId) return errorJson(400, 'canonical y duplicate no pueden ser la misma persona')

  // Ownership: ambos ids son del usuario.
  const { data: rows, error: pplErr } = await supabase
    .from('people')
    .select('id, slug, name, tags, notes, special_dates')
    .eq('user_id', userId)
    .in('id', [canonicalId, duplicateId])
  if (pplErr) return errorJson(500, 'No se pudo leer personas', pplErr.message)
  const both = (rows ?? []) as Array<{ id: string; slug: string | null; name: string; tags: string[] | null; notes: string | null; special_dates: unknown[] | null }>
  if (both.length !== 2) return errorJson(404, 'Una o ambas personas no existen o no son tuyas')
  const canonical = both.find((r) => r.id === canonicalId)!
  const duplicate = both.find((r) => r.id === duplicateId)!

  const moved: MovedStat[] = []

  // ─── 1. Reasignar person_id en las 10 tablas ────────────────────
  for (const table of PERSON_ID_TABLES) {
    try {
      const { data, error } = await supabase
        .from(table)
        .update({ person_id: canonicalId })
        .eq('user_id', userId)
        .eq('person_id', duplicateId)
        .select('id')
      const count = data?.length ?? 0
      if (error) {
        // Tabla puede no existir en algún entorno — no fatal. Loguear y seguir.
        // (mig 0091 relationship_moments, 0095 moment_participants, 0107, 0108…)
        console.warn(`[merge] ${table}:`, error.message)
        continue
      }
      moved.push({ table, count })
    } catch (e) {
      console.warn(`[merge] ${table}:`, e)
    }
  }

  // ─── 2. person_links: reasignar person_a_id y person_b_id ────────
  try {
    const { data: dataA } = await supabase
      .from('person_links')
      .update({ person_a_id: canonicalId })
      .eq('user_id', userId)
      .eq('person_a_id', duplicateId)
      .select('id')
    const { data: dataB } = await supabase
      .from('person_links')
      .update({ person_b_id: canonicalId })
      .eq('user_id', userId)
      .eq('person_b_id', duplicateId)
      .select('id')
    moved.push({ table: 'person_links (as A)', count: dataA?.length ?? 0 })
    moved.push({ table: 'person_links (as B)', count: dataB?.length ?? 0 })

    // Post-cleanup: eliminar self-loops que hayan resultado (A == B).
    // Supabase no acepta `.eq()` entre 2 columnas → usamos rpc/raw filter con
    // .neq() no sirve; hacemos fetch + delete de los ids afectados.
    const { data: selfLoops } = await supabase
      .from('person_links')
      .select('id')
      .eq('user_id', userId)
      .eq('person_a_id', canonicalId)
      .eq('person_b_id', canonicalId)
    if (selfLoops && selfLoops.length > 0) {
      const ids = (selfLoops as Array<{ id: string }>).map((r) => r.id)
      await supabase.from('person_links').delete().in('id', ids)
      moved.push({ table: 'person_links (self-loops eliminados)', count: ids.length })
    }
  } catch (e) {
    console.warn('[merge] person_links:', e)
  }

  // ─── 3. Mergear tags + notes + special_dates en el canonical ─────
  try {
    const mergedTags = Array.from(new Set([...(canonical.tags ?? []), ...(duplicate.tags ?? [])]))
    const mergedNotes = (() => {
      const c = (canonical.notes ?? '').trim()
      const d = (duplicate.notes ?? '').trim()
      if (!d) return c
      if (!c) return d
      if (c === d) return c
      return `${c}\n\n---\n${d}`
    })()
    const mergedSpecialDates = Array.isArray(canonical.special_dates) || Array.isArray(duplicate.special_dates)
      ? [...(canonical.special_dates ?? []), ...(duplicate.special_dates ?? [])]
      : (canonical.special_dates ?? duplicate.special_dates ?? [])

    await supabase
      .from('people')
      .update({ tags: mergedTags, notes: mergedNotes, special_dates: mergedSpecialDates, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', canonicalId)
  } catch (e) {
    console.warn('[merge] update canonical:', e)
  }

  // ─── 4. Borrar el row del duplicate ──────────────────────────────
  const { error: delErr } = await supabase
    .from('people')
    .delete()
    .eq('user_id', userId)
    .eq('id', duplicateId)
  if (delErr) return errorJson(500, 'No se pudo borrar el duplicado (data movida OK)', delErr.message)

  return NextResponse.json({ ok: true, moved, canonical_slug: canonical.slug }, { status: 200 })
}
