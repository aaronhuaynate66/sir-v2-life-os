// SIR V2 — POST /api/self/retrato. Un RETRATO sintetizado de quién es Aaron HOY,
// a partir de los datos que SIR ya tiene (identidad, norte, cómo viene la semana,
// vínculos, conflictos). El cliente arma los HECHOS; el modelo solo los teje en
// un párrafo honesto. No inventa.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { resolveModel } from '@/lib/sir/model'
import { runSirChat } from '@/lib/sir/chatProvider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SYSTEM = `Sos SIR, el sistema operativo de vida de Aaron. Con los DATOS que te paso (identidad, su norte, cómo viene la semana, sus vínculos y conflictos), escribí un RETRATO de quién es HOY.

Reglas:
- Segunda persona ("Sos…", "Venís…"). Español rioplatense, sobrio y cálido, sin adular.
- UN párrafo, 4 a 6 oraciones. Integrá identidad + hacia dónde apunta (su norte) + cómo viene la semana + sus vínculos/tensiones en una lectura con sentido, no una lista.
- Usá SOLO los datos provistos. No inventes rasgos, logros ni emociones que no estén.
- Cerrá con una observación honesta sobre la tensión central de su momento, NO con una orden ni un consejo.
- Si faltan datos, no lo menciones; escribí con lo que hay.
Devolvé solo el párrafo, sin encabezados ni comillas.`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const rl = await enforceRateLimit(supabase, auth.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: { facts?: unknown }
  try { body = (await req.json()) as { facts?: unknown } } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const facts = typeof body.facts === 'string' ? body.facts.trim().slice(0, 4000) : ''
  if (!facts) return NextResponse.json({ error: 'Sin datos para el retrato' }, { status: 400 })

  let chatModel = 'sonnet'
  try {
    const { data: settings } = await supabase.from('sir_settings').select('chat_model').eq('user_id', auth.user.id).maybeSingle()
    chatModel = (settings as { chat_model?: string } | null)?.chat_model ?? 'sonnet'
  } catch { /* default */ }
  const model = resolveModel(chatModel)
  const providerKey = process.env[model.envKey]
  if (!providerKey) return NextResponse.json({ error: `Falta ${model.envKey}` }, { status: 500 })

  try {
    const { answer } = await runSirChat({
      model, system: SYSTEM, history: [], userContent: facts,
      anthropicKey: model.provider === 'anthropic' ? providerKey : undefined,
      openrouterKey: model.provider === 'openrouter' ? providerKey : undefined,
    })
    return NextResponse.json({ retrato: answer })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo generar el retrato', detail: String(e).slice(0, 120) }, { status: 502 })
  }
}
