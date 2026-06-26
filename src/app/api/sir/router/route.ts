// SIR V2 — POST /api/sir/router (Router de relato · FASE 2: endpoint planner).
// Recibe un relato en lenguaje natural + arma el CONTEXTO de Aaron (nombres de
// personas, empresas y objetivos para que la IA no duplique) → llama a la IA con
// ROUTER_SYSTEM → devuelve un PLAN de acciones tipadas (parseRouterPlan).
// NO ejecuta nada: el ejecutor + la UI de confirmación vienen en la fase 3.
// Body: { narrative: string } → { plan: { actions, unmapped }, context }
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { resolveModel } from '@/lib/sir/model'
import { runSirChat } from '@/lib/sir/chatProvider'
import { ROUTER_SYSTEM, parseRouterPlan } from '@/lib/sir/router/plan'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  let body: { narrative?: unknown }
  try { body = (await req.json()) as { narrative?: unknown } } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const narrative = typeof body.narrative === 'string' ? body.narrative.trim().slice(0, 4000) : ''
  if (narrative.length < 8) return NextResponse.json({ error: 'Contame el relato (un poco más largo).' }, { status: 400 })

  // ── Contexto para dedup: nombres de personas, empresas y objetivos ──
  const people: string[] = []
  const orgs: string[] = []
  const goals: string[] = []
  try {
    const { data } = await supabase.from('people').select('name').eq('user_id', userId).limit(500)
    for (const p of (data ?? []) as Array<{ name: string }>) if (p.name) people.push(p.name)
  } catch { /* best-effort */ }
  try {
    const { data } = await supabase.from('org_profiles').select('name').eq('user_id', userId).limit(200)
    for (const o of (data ?? []) as Array<{ name: string }>) if (o.name) orgs.push(o.name)
  } catch { /* best-effort */ }
  try {
    const { data } = await supabase.from('goals').select('title').eq('user_id', userId).eq('status', 'active').limit(100)
    for (const g of (data ?? []) as Array<{ title: string }>) if (g.title) goals.push(g.title)
  } catch { /* best-effort */ }

  let chatModel = 'sonnet'
  try {
    const { data: settings } = await supabase.from('sir_settings').select('chat_model').eq('user_id', userId).maybeSingle()
    chatModel = (settings as { chat_model?: string } | null)?.chat_model ?? 'sonnet'
  } catch { /* default */ }
  const model = resolveModel(chatModel)
  const providerKey = process.env[model.envKey]
  if (!providerKey) return NextResponse.json({ error: `Falta ${model.envKey}` }, { status: 500 })

  const ctx = [
    `Hoy es ${new Date().toISOString().slice(0, 10)}.`,
    people.length ? `Personas que YA existen (no las dupliques): ${people.slice(0, 300).join('; ')}.` : 'No tiene personas cargadas todavía.',
    orgs.length ? `Empresas/entidades que YA existen: ${orgs.join('; ')}.` : 'No tiene empresas cargadas.',
    goals.length ? `Objetivos activos (usá el título exacto): ${goals.join('; ')}.` : 'No tiene objetivos activos.',
  ].join('\n')
  const userContent = `CONTEXTO:\n${ctx}\n\nRELATO:\n${narrative}`

  try {
    const { answer } = await runSirChat({
      model,
      system: ROUTER_SYSTEM,
      history: [],
      userContent,
      anthropicKey: model.provider === 'anthropic' ? providerKey : undefined,
      openrouterKey: model.provider === 'openrouter' ? providerKey : undefined,
    })
    const plan = parseRouterPlan(answer)
    return NextResponse.json({ plan, context: { people: people.length, orgs: orgs.length, goals: goals.length } })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo armar el plan', detail: String(e).slice(0, 120) }, { status: 500 })
  }
}
