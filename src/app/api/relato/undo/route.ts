// SIR V2 — POST /api/relato/undo
//
// Revierte una lista de creaciones recientes de /api/relato/apply o
// /api/relato/ingest (con apply=true). Recibe items {kind, id} y borra
// respetando ownership por RLS. Idempotente: si el id ya no existe (borrado
// manual), se salta silenciosamente.
//
// Kinds soportados:
//   crear_moment            → delete relationship_moments
//   crear_person_log        → delete person_logs
//   crear_nota_manual       → delete observations
//   registrar_ciclo         → delete person_cycles
//   upsert_cumpleanos       → NO se puede deshacer trivially (queda en el
//                             array people.special_dates). Skipeamos y
//                             devolvemos warning.
//   crear_objetivo          → delete goals
//   crear_persona           → delete people (⚠ cascada — cuidado)

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface UndoItem {
  kind: string
  id: string
}

const TABLE_BY_KIND: Record<string, string | null> = {
  crear_moment: 'relationship_moments',
  crear_person_log: 'person_logs',
  crear_nota_manual: 'observations',
  registrar_ciclo: 'person_cycles',
  upsert_cumpleanos: null, // no revertible fácil (jsonb array)
  crear_objetivo: 'goals',
  crear_persona: 'people',
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: { items?: unknown }
  try { body = await req.json() as typeof body } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  if (!Array.isArray(body.items)) return NextResponse.json({ error: 'items[] requerido' }, { status: 400 })

  const items = (body.items as unknown[])
    .map((x) => x as Partial<UndoItem>)
    .filter((x): x is UndoItem => typeof x.kind === 'string' && typeof x.id === 'string' && x.id.length > 0)

  const results: Array<{ kind: string; id: string; ok: boolean; warning?: string }> = []
  for (const it of items) {
    const table = TABLE_BY_KIND[it.kind]
    if (!table) {
      results.push({ kind: it.kind, id: it.id, ok: false, warning: `${it.kind} no se puede deshacer automáticamente` })
      continue
    }
    try {
      const { error } = await supabase.from(table).delete()
        .eq('user_id', auth.user.id).eq('id', it.id)
      if (error) { results.push({ kind: it.kind, id: it.id, ok: false, warning: error.message }); continue }
      results.push({ kind: it.kind, id: it.id, ok: true })
    } catch (e) {
      results.push({ kind: it.kind, id: it.id, ok: false, warning: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ results })
}
