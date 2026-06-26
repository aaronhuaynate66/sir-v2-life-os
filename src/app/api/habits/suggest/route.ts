// SIR V2 — GET /api/habits/suggest. SIR propone 1-2 hábitos PEGADOS al norte y
// a los objetivos activos de Aaron. Pocos y alineados (no una lista larga: los
// hábitos solo sirven si se sostienen). Propone, no crea — Aaron acepta.
// Devuelve { suggestions: HabitSuggestion[] } (máx 2, sin duplicar lo que ya tiene).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { resolveModel } from '@/lib/sir/model'
import { runSirChat } from '@/lib/sir/chatProvider'
import { parseHabitSuggestions } from '@/lib/habits/suggestParse'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const SYSTEM = `Sos SIR, el asesor de Aaron. Te paso su NORTE del año, sus objetivos activos y los hábitos que YA tiene. Proponé como MÁXIMO 2 hábitos conductuales nuevos que lo acerquen de forma concreta a esos objetivos.

Reglas duras:
- Pocos y sostenibles. Mejor 1 bueno que 2 forzados. Si ya tiene cubierto lo importante, devolvé [].
- NO repitas un hábito que ya tiene.
- Cada hábito es una acción conductual concreta y marcable a diario o por semana (no una meta vaga).
- cadence 'daily' (todos los días) o 'weekly' con targetPerPeriod 1-7 (veces por semana). Usá 'weekly' cuando a diario no tenga sentido (ej. entrenar fuerte 3x/semana).
- rationale: una frase corta que ate el hábito a SU objetivo real (citalo).

Respondé SOLO un array JSON, sin texto alrededor:
[{"title":"...","cadence":"daily|weekly","targetPerPeriod":1,"rationale":"..."}]`

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  // Contexto: norte + objetivos + hábitos actuales (para no duplicar).
  const lines: string[] = []
  let existing: string[] = []
  try {
    const { data: goals } = await supabase.from('goals').select('title, why, is_anchor, next_action').eq('user_id', userId).eq('status', 'active').limit(15)
    const gs = (goals ?? []) as Array<{ title: string; why: string | null; is_anchor: boolean | null; next_action: string | null }>
    const anchor = gs.find((g) => g.is_anchor)
    if (anchor) lines.push(`Norte: «${anchor.title}»${anchor.why ? ` (por qué: ${anchor.why})` : ''}.`)
    const others = gs.filter((g) => !g.is_anchor).map((g) => g.title)
    if (others.length) lines.push(`Otros objetivos activos: ${others.slice(0, 10).join('; ')}.`)
  } catch { /* best-effort */ }
  try {
    const { data: habits } = await supabase.from('habits').select('title').eq('user_id', userId).eq('active', true).limit(50)
    existing = ((habits ?? []) as Array<{ title: string }>).map((h) => h.title)
    if (existing.length) lines.push(`Hábitos que YA tiene (no los repitas): ${existing.join('; ')}.`)
  } catch { /* best-effort */ }

  if (lines.length === 0 || !lines.some((l) => l.startsWith('Norte') || l.startsWith('Otros'))) {
    return NextResponse.json({ suggestions: [], note: 'sin_objetivos' })
  }

  let chatModel = 'sonnet'
  try {
    const { data: settings } = await supabase.from('sir_settings').select('chat_model').eq('user_id', userId).maybeSingle()
    chatModel = (settings as { chat_model?: string } | null)?.chat_model ?? 'sonnet'
  } catch { /* default */ }
  const model = resolveModel(chatModel)
  const providerKey = process.env[model.envKey]
  if (!providerKey) return NextResponse.json({ error: `Falta ${model.envKey}` }, { status: 500 })

  try {
    const { answer } = await runSirChat({
      model,
      system: SYSTEM,
      history: [],
      userContent: `MI CONTEXTO:\n${lines.join('\n')}`,
      anthropicKey: model.provider === 'anthropic' ? providerKey : undefined,
      openrouterKey: model.provider === 'openrouter' ? providerKey : undefined,
    })
    const norm = (t: string) => t.trim().toLowerCase()
    const have = new Set(existing.map(norm))
    const suggestions = parseHabitSuggestions(answer).filter((s) => !have.has(norm(s.title)))
    return NextResponse.json({ suggestions })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudieron generar sugerencias', detail: String(e).slice(0, 120) }, { status: 500 })
  }
}
