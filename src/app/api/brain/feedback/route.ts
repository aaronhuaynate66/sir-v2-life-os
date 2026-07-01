// SIR V2 — /api/brain/feedback (Cerebro F3 · Hebbian I/O).
//
// POST { edgeKey, action } → aplica un delta de peso aprendido a la arista
// identificada por `edgeKey`. La firma es exactamente la que devuelve
// `edgeKey(...)` en `src/lib/brain/types.ts`; cualquier drift rompe con 400.
//
// Contrato:
//   POST { edgeKey: string, action: 'reinforce' | 'discard' }
//   → 200 { ok: true, weight: numeroNuevo }
//   → 400 si el edgeKey no matcha el formato o el action es invalido
//   → 401 si no hay sesion
//   → 503 si edge_weights no existe todavia (mig 0106 no corrida)
//
// Read-then-write en dos queries (RLS scopea por user_id). Las races entre
// clicks del mismo usuario son toleradas (multi-tab poco realista; magnitud
// chica; el clamp evita explosion).

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { applyFeedback, parseEdgeKey } from '@/lib/brain/hebbian'
import { BASE_WEIGHT, type EdgeKind } from '@/lib/brain/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface FeedbackBody {
  edgeKey?: unknown
  action?: unknown
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: FeedbackBody
  try {
    body = (await req.json()) as FeedbackBody
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const edgeKey = typeof body.edgeKey === 'string' ? body.edgeKey.trim() : ''
  const action = body.action === 'reinforce' || body.action === 'discard' ? body.action : null
  if (!edgeKey || !action) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const parts = parseEdgeKey(edgeKey)
  if (!parts) {
    return NextResponse.json({ error: 'invalid_edge_key' }, { status: 400 })
  }
  const kind = parts.kind as EdgeKind
  const baseWeight = BASE_WEIGHT[kind]
  if (typeof baseWeight !== 'number') {
    return NextResponse.json({ error: 'unknown_kind' }, { status: 400 })
  }

  // Read: peso actual (delta aprendido). Fail si tabla no existe (mig 0106).
  const readRes = await supabase
    .from('edge_weights')
    .select('weight')
    .eq('user_id', user.id)
    .eq('edge_key', edgeKey)
    .maybeSingle()
  if (readRes.error && readRes.error.code !== 'PGRST116') {
    // PGRST116 = no rows (esperable); cualquier otro error implica tabla
    // ausente o problema real → 503 pa que el cliente sepa que el aprendizaje
    // no persistio.
    return NextResponse.json({ error: 'edge_weights_unavailable' }, { status: 503 })
  }
  const currentDeltaRaw = readRes.data?.weight
  const currentDelta =
    typeof currentDeltaRaw === 'string'
      ? Number(currentDeltaRaw)
      : typeof currentDeltaRaw === 'number'
      ? currentDeltaRaw
      : 0
  const safeCurrent = Number.isFinite(currentDelta) ? currentDelta : 0

  const newDelta = applyFeedback({
    currentDelta: safeCurrent,
    action,
    baseWeight,
  })

  // Write: upsert por (user_id, edge_key). RLS asegura scope al user.
  const writeRes = await supabase.from('edge_weights').upsert(
    {
      user_id: user.id,
      edge_key: edgeKey,
      weight: newDelta,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,edge_key' },
  )
  if (writeRes.error) {
    return NextResponse.json({ error: 'edge_weights_unavailable' }, { status: 503 })
  }

  return NextResponse.json({ ok: true, weight: newDelta })
}
