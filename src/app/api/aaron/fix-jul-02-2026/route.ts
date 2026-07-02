// SIR V2 — POST /api/aaron/fix-jul-02-2026
//
// Endpoint ONE-SHOT idempotente que corrige dos cosas del 02-jul-2026:
//
// (A) BUG del backfill anterior (/api/aaron/backfill-jul-2026):
//     metí el relato afectivo con Diana en Diana **Cencaro** (compañera
//     de trabajo HNG) cuando el nombre correcto es Diana **Díaz** (novia).
//     Este endpoint MUEVE los items backfilled desde Cencaro hacia Díaz.
//     Si Díaz no existe todavía, la crea.
//
// (B) Agrega el cumpleaños de Fabiola Masías (Ponce) → 9 de junio.
//
// Idempotente por diseño: si se llama 2 veces, la 2da no encuentra items
// mal ubicados (ya se movieron) y el special_date se detecta como existente.
//
// Alcance de los items backfilled a mover: los que tienen títulos exactos del
// array DIANA_MOMENTS del backfill anterior (4 moments) + person_logs de los
// mismos 4 días con kind='interaction' + observation con data.backfill_key
// que empieza por 'diana:'.
//
// Cero data destructiva. Cero migración.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface Stat { moved: number; created: number; skipped: number; notes: string[] }

// Titles EXACTOS del backfill anterior (usarlos para hacer match determinista
// sin ambigüedad; si Aaron edita alguno a mano, ese ya no se mueve — es lo
// esperado, no queremos pisar cambios manuales).
const BACKFILL_TITLES = [
  'Regresamos — acordamos reintento',
  'Me quitó su ubicación · discutimos al reencontrarnos',
  'Hotel · reconexión con discusión de fondo',
  'Examen médico de control (seguro que yo pago)',
] as const

const BACKFILL_LOG_DATES = [
  '2026-06-26T20:00:00-05:00',
  '2026-06-28T22:00:00-05:00',
  '2026-06-29T23:30:00-05:00',
  '2026-07-01T18:00:00-05:00',
] as const

const OBSERVATION_KEY = 'diana:relato-semana:2026-06-26_2026-07-01'

// ─── Helpers ──────────────────────────────────────────────────────────

interface PersonRow { id: string; name: string; slug: string | null }

async function findByExactName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  fullName: string,
): Promise<PersonRow | null> {
  const { data } = await supabase
    .from('people')
    .select('id, name, slug')
    .eq('user_id', userId)
    .ilike('name', fullName)
    .limit(5)
  const rows = (data ?? []) as PersonRow[]
  return rows[0] ?? null
}

async function findByPrefix(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  prefix: string,
): Promise<PersonRow[]> {
  const { data } = await supabase
    .from('people')
    .select('id, name, slug')
    .eq('user_id', userId)
    .ilike('name', `${prefix}%`)
    .limit(20)
  return ((data ?? []) as PersonRow[])
}

/** Crea Diana Díaz si no existe. Slug generado local. */
async function ensureDianaDiaz(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  stat: Stat,
): Promise<PersonRow | null> {
  const existing = await findByExactName(supabase, userId, 'Diana Díaz')
    ?? await findByExactName(supabase, userId, 'Diana Diaz')
  if (existing) return existing

  const { data, error } = await supabase.from('people').insert({
    user_id: userId,
    name: 'Diana Díaz',
    slug: 'diana-diaz',
    category: 'personal',
    relationship: 'pareja',
    importance_score: 10,
    confidence_score: 7,
    tags: ['novia'],
  }).select('id, name, slug').single()
  if (error || !data) {
    stat.notes.push(`no pude crear Diana Díaz: ${error?.message ?? 'sin data'}`)
    return null
  }
  stat.created++
  return data as PersonRow
}

// ─── Handler ──────────────────────────────────────────────────────────

export async function POST() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  const dianas: Stat = { moved: 0, created: 0, skipped: 0, notes: [] }
  const fabiolaBday: Stat = { moved: 0, created: 0, skipped: 0, notes: [] }

  // ─── (A) Reruteo Cencaro → Díaz ─────────────────────────────────────
  const cencaro = await findByExactName(supabase, userId, 'Diana Cencaro')
  const diaz = await ensureDianaDiaz(supabase, userId, dianas)

  if (!cencaro) {
    dianas.notes.push('no encontré Diana Cencaro — nada que mover')
  } else if (!diaz) {
    dianas.notes.push('no pude asegurar Diana Díaz como destino')
  } else if (cencaro.id === diaz.id) {
    dianas.notes.push('Cencaro y Díaz son la misma row — abort')
  } else {
    // Mover moments con los títulos exactos del backfill.
    for (const title of BACKFILL_TITLES) {
      const { data: found } = await supabase
        .from('relationship_moments')
        .select('id, person_id')
        .eq('user_id', userId)
        .eq('person_id', cencaro.id)
        .eq('title', title)
        .limit(1)
      const hit = ((found ?? []) as Array<{ id: string }>)[0]
      if (!hit) { dianas.skipped++; continue }
      const { error } = await supabase
        .from('relationship_moments')
        .update({ person_id: diaz.id, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('id', hit.id)
      if (error) { dianas.notes.push(`moment "${title}": ${error.message}`); continue }
      dianas.moved++
    }
    // Mover person_logs de los 4 timestamps hardcodeados con kind='interaction'.
    for (const at of BACKFILL_LOG_DATES) {
      const { data: found } = await supabase
        .from('person_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('person_id', cencaro.id)
        .eq('kind', 'interaction')
        .eq('logged_at', at)
        .limit(1)
      const hit = ((found ?? []) as Array<{ id: string }>)[0]
      if (!hit) { dianas.skipped++; continue }
      const { error } = await supabase
        .from('person_logs')
        .update({ person_id: diaz.id })
        .eq('user_id', userId)
        .eq('id', hit.id)
      if (error) { dianas.notes.push(`log ${at}: ${error.message}`); continue }
      dianas.moved++
    }
    // Mover observation manual_note con backfill_key.
    const { data: obs } = await supabase
      .from('observations')
      .select('id, data')
      .eq('user_id', userId)
      .eq('person_id', cencaro.id)
      .eq('capture_type', 'manual_note')
      .limit(50)
    const target = ((obs ?? []) as Array<{ id: string; data: Record<string, unknown> | null }>)
      .find((r) => (r.data as { backfill_key?: string } | null)?.backfill_key === OBSERVATION_KEY)
    if (target) {
      const { error } = await supabase
        .from('observations')
        .update({ person_id: diaz.id })
        .eq('user_id', userId)
        .eq('id', target.id)
      if (error) dianas.notes.push(`observation resumen: ${error.message}`)
      else dianas.moved++
    } else {
      dianas.skipped++
    }
  }

  // ─── (B) Cumple de Fabiola Masías (9-jun) ──────────────────────────
  // Aaron dijo textual "el cumpleaños de Fabiola Masías es el 9 de junio".
  // Puede haber más de una Fabiola (canónica post-merge) — apuntamos a
  // "Fabiola Masías Ponce" (canonical), y como fallback la primera Fabiola.
  const fabiola = await findByExactName(supabase, userId, 'Fabiola Masías Ponce')
    ?? await findByExactName(supabase, userId, 'Fabiola Masías')
    ?? (await findByPrefix(supabase, userId, 'Fabiola'))[0]
  if (!fabiola) {
    fabiolaBday.notes.push('no encontré ninguna Fabiola — nada que agregar')
  } else {
    const { data: row } = await supabase
      .from('people')
      .select('id, special_dates')
      .eq('user_id', userId)
      .eq('id', fabiola.id)
      .single()
    const current = ((row?.special_dates as Array<{ id?: string; label?: string; date?: string }> | null) ?? [])
    const already = current.find((d) => d.date === '2026-06-09' && /cumple|birthday|nacimiento/i.test(d.label ?? ''))
    if (already) {
      fabiolaBday.skipped++
      fabiolaBday.notes.push('cumple 9-jun ya cargado')
    } else {
      const id = `bd-fabiola-${Date.now()}`
      const next = [...current, { id, label: 'Cumpleaños', date: '2026-06-09', recurring: true }]
      const { error } = await supabase.from('people').update({
        special_dates: next,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('id', fabiola.id)
      if (error) fabiolaBday.notes.push(`no pude guardar cumple: ${error.message}`)
      else fabiolaBday.created++
    }
  }

  return NextResponse.json({
    ok: true,
    dianas,
    fabiolaBday,
    dianaCencaroId: cencaro?.id ?? null,
    dianaDiazId: diaz?.id ?? null,
    dianaDiazSlug: diaz?.slug ?? null,
    fabiolaId: fabiola?.id ?? null,
    fabiolaSlug: fabiola?.slug ?? null,
  })
}
