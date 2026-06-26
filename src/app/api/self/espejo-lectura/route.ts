// SIR V2 — POST /api/self/espejo-lectura (Motor #1, capa de lectura).
// El Espejo da hechos sueltos (gaps); esto los CONECTA en una lectura breve:
// qué historia cuentan juntos + la tensión central. No repite los bullets ni da
// listas de consejos (la acción vive en el Experimento). No inventa.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { resolveModel } from '@/lib/sir/model'
import { runSirChat } from '@/lib/sir/chatProvider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SYSTEM = `Sos SIR, el asesor de Aaron — honesto antes que complaciente. Te paso el ESPEJO de su semana: un estado, los DESAJUSTES detectados (lo declarado vs lo hecho) y, si hay, lo que SÍ logró.

Escribí una LECTURA breve que CONECTE los puntos: qué tienen en común esos desajustes, qué historia cuentan juntos, cuál es la TENSIÓN central de su semana. 3 a 4 oraciones, segunda persona ("Venís…", "Tu semana…"), español rioplatense, sobrio.

Reglas:
- NO repitas los bullets textualmente; el valor es conectar, no listar de nuevo.
- NO des una lista de consejos ni "deberías" — la acción concreta vive en otro lado (el experimento de la semana). Podés cerrar señalando la tensión, no ordenando.
- Usá SOLO lo que te paso. No inventes hechos, personas ni números.
- Si el estado es "alineado", reforzá con sobriedad lo que está sosteniendo el rumbo.
Devolvé solo el párrafo, sin encabezados ni comillas.`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const rl = await enforceRateLimit(supabase, auth.user.id, 'generation')
  if (!rl.ok) return rl.response

  let body: { state?: unknown; headline?: unknown; gaps?: unknown; wins?: unknown }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const headline = typeof body.headline === 'string' ? body.headline.slice(0, 300) : ''
  const state = typeof body.state === 'string' ? body.state.slice(0, 40) : ''
  const gaps = Array.isArray(body.gaps)
    ? body.gaps.map((g) => {
        const o = g as { label?: unknown; observed?: unknown; severity?: unknown }
        const label = typeof o.label === 'string' ? o.label.slice(0, 200) : ''
        const observed = typeof o.observed === 'string' ? o.observed.slice(0, 200) : ''
        const sev = typeof o.severity === 'string' ? o.severity : ''
        return label ? `- (${sev}) ${label} — ${observed}` : ''
      }).filter(Boolean).slice(0, 8)
    : []
  const wins = Array.isArray(body.wins)
    ? body.wins.map((w) => (typeof w === 'string' ? `- ${w.slice(0, 200)}` : '')).filter(Boolean).slice(0, 6)
    : []
  if (gaps.length === 0 && wins.length === 0) return NextResponse.json({ error: 'Sin material para leer' }, { status: 400 })

  let chatModel = 'sonnet'
  try {
    const { data: settings } = await supabase.from('sir_settings').select('chat_model').eq('user_id', auth.user.id).maybeSingle()
    chatModel = (settings as { chat_model?: string } | null)?.chat_model ?? 'sonnet'
  } catch { /* default */ }
  const model = resolveModel(chatModel)
  const providerKey = process.env[model.envKey]
  if (!providerKey) return NextResponse.json({ error: `Falta ${model.envKey}` }, { status: 500 })

  const userContent = [
    `Estado de la semana: ${state} — ${headline}`,
    gaps.length ? `\nDesajustes:\n${gaps.join('\n')}` : '',
    wins.length ? `\nLo que sí logró:\n${wins.join('\n')}` : '',
  ].filter(Boolean).join('\n')

  try {
    const { answer } = await runSirChat({
      model, system: SYSTEM, history: [], userContent,
      anthropicKey: model.provider === 'anthropic' ? providerKey : undefined,
      openrouterKey: model.provider === 'openrouter' ? providerKey : undefined,
    })
    return NextResponse.json({ lectura: answer })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo leer la semana', detail: String(e).slice(0, 120) }, { status: 502 })
  }
}
