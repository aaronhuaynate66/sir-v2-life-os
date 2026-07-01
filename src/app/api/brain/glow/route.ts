// SIR V2 — /api/brain/glow (Cerebro F4 · Surfacing).
//
// GET → devuelve lo que el cerebro tiene "encendido" alrededor de un nodo
// contextual. Sin params: elige la semilla del contexto siguiendo prioridad
// nextGoal (target_date mas proximo futuro entre goals activos) → anchor
// (is_anchor=true) → primer goal activo del grafo. Con `?seed=tipo:id`:
// respeta esa semilla.
//
// Sin IA, sin cache, sin estado — es una funcion pura de las tablas + hoy.
// Session-auth (usa el server client). Fail-open sobre las fuentes que
// alimentan el grafo (loader.ts es fail-soft por tabla).

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { loadBrainGraph } from '@/lib/brain/loader'
import { describeGlow, pickSeedForContext } from '@/lib/brain/surface'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 8
const MAX_LIMIT = 30

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const explicitSeed = url.searchParams.get('seed')?.trim() ?? ''
  const limitRaw = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT)
  const limit = Number.isFinite(limitRaw)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitRaw)))
    : DEFAULT_LIMIT

  // Contexto para elegir semilla (solo goals activos con target_date futuro).
  // Fail-soft: si la lectura falla, `goalsRes` cae a []. `nextGoal` puede quedar
  // vacio y pickSeedForContext usa el fallback.
  const todayIso = new Date().toISOString().slice(0, 10)
  const goalsRes = await supabase
    .from('goals')
    .select('id, target_date, is_anchor, status')
    .eq('status', 'active')
  const goalsRows: Array<{ id: string; target_date: string | null; is_anchor: boolean | null }> =
    goalsRes.error ? [] : ((goalsRes.data ?? []) as Array<{ id: string; target_date: string | null; is_anchor: boolean | null }>)

  // nextGoalId = target_date >= hoy mas cercano.
  const upcoming = goalsRows
    .filter((g) => typeof g.target_date === 'string' && g.target_date >= todayIso)
    .sort((a, b) => (a.target_date as string).localeCompare(b.target_date as string))
  const nextGoalId = upcoming[0]?.id ?? null

  // anchorGoalId = is_anchor=true (solo puede haber uno, memoria del ano).
  const anchorGoalId = goalsRows.find((g) => g.is_anchor === true)?.id ?? null

  const graph = await loadBrainGraph(supabase, user.id)
  const seed = explicitSeed || pickSeedForContext({ nextGoalId, anchorGoalId }, graph)

  if (!seed) {
    // No hay goal alguno ⇒ no hay semilla contextual. Fail-soft, no rompe.
    return NextResponse.json({
      seedNodeKey: null,
      seedLabel: null,
      rows: [],
    })
  }

  const glow = describeGlow(graph, seed, limit)
  if (!glow) {
    return NextResponse.json({
      seedNodeKey: seed,
      seedLabel: null,
      rows: [],
    })
  }

  return NextResponse.json({
    seedNodeKey: glow.seedNodeKey,
    seedLabel: glow.seedLabel,
    rows: glow.rows,
  })
}
