// SIR V2 — POST /api/self/premortem (Motor #3 · Pre-Mortem de decisiones).
// Antes de un movimiento grande, SIR proyecta la consecuencia MÁS PROBABLE
// DESDE el patrón documentado de Aaron (su norte, sus objetivos activos, sus
// conflictos abiertos). No adivina el futuro: lo confronta con su propia data.
// Body: { decision: string }  →  { premortem: string }
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { resolveModel } from '@/lib/sir/model'
import { runSirChat } from '@/lib/sir/chatProvider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const SYSTEM = `Sos SIR, el asesor de Aaron — más frío y honesto que complaciente. Te dan UNA decisión que Aaron está por tomar y el CONTEXTO de su vida (su norte, objetivos activos, conflictos abiertos). Tu tarea es un PRE-MORTEM: imaginá que ya pasaron ~6 meses desde que tomó esa decisión y escribí, en español rioplatense, con esta estructura breve:

1. "Lo más probable según tu patrón": el desenlace más realista, anclado en SU data (citá el conflicto/objetivo concreto cuando aplique). Si los datos no alcanzan para afirmar, decilo.
2. "Riesgos": 2-3 riesgos concretos, no genéricos.
3. "Qué vigilar": 1-2 señales tempranas de que va mal.
4. "Si igual lo hacés": una mitigación concreta.

Reglas: no moralices, no inventes hechos fuera del contexto, no adules. Sé directo y útil. Máximo ~180 palabras.`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  let body: { decision?: unknown }
  try { body = (await req.json()) as { decision?: unknown } } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const decision = typeof body.decision === 'string' ? body.decision.trim().slice(0, 600) : ''
  if (!decision) return NextResponse.json({ error: 'Contame la decisión' }, { status: 400 })

  let chatModel = 'sonnet'
  try {
    const { data: settings } = await supabase.from('sir_settings').select('chat_model').eq('user_id', userId).maybeSingle()
    chatModel = (settings as { chat_model?: string } | null)?.chat_model ?? 'sonnet'
  } catch { /* default */ }
  const model = resolveModel(chatModel)
  const providerKey = process.env[model.envKey]
  if (!providerKey) return NextResponse.json({ error: `Falta ${model.envKey}` }, { status: 500 })

  // ── Grounding: norte + objetivos activos + conflictos abiertos ──────
  const lines: string[] = []
  try {
    const { data: goals } = await supabase.from('goals').select('title, why, is_anchor').eq('user_id', userId).eq('status', 'active').limit(12)
    const gs = (goals ?? []) as Array<{ title: string; why: string | null; is_anchor: boolean }>
    const anchor = gs.find((g) => g.is_anchor)
    if (anchor) lines.push(`Tu norte: «${anchor.title}»${anchor.why ? ` (por qué: ${anchor.why})` : ''}.`)
    const others = gs.filter((g) => !g.is_anchor).map((g) => g.title)
    if (others.length) lines.push(`Otros objetivos activos: ${others.slice(0, 8).join('; ')}.`)
  } catch { /* best-effort */ }
  try {
    const { data: moments } = await supabase.from('relationship_moments').select('title').eq('user_id', userId).eq('status', 'abierto').order('occurred_on', { ascending: false }).limit(10)
    const titles = ((moments ?? []) as Array<{ title: string }>).map((m) => m.title)
    if (titles.length) lines.push(`Conflictos/temas abiertos sin resolver: ${titles.join('; ')}.`)
  } catch { /* best-effort */ }

  const context = lines.length ? lines.join('\n') : '(Sin objetivos ni conflictos cargados — avisá que la lectura es pobre por falta de data.)'
  const userContent = `DECISIÓN que estoy por tomar:\n${decision}\n\nMI CONTEXTO:\n${context}`

  try {
    const { answer } = await runSirChat({
      model,
      system: SYSTEM,
      history: [],
      userContent,
      anthropicKey: model.provider === 'anthropic' ? providerKey : undefined,
      openrouterKey: model.provider === 'openrouter' ? providerKey : undefined,
    })
    return NextResponse.json({ premortem: answer })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo correr el pre-mortem', detail: String(e).slice(0, 120) }, { status: 500 })
  }
}
