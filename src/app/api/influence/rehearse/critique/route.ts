// SIR V2 — POST /api/influence/rehearse/critique
//
// Segundo par de ojos sobre el acercamiento que el Ensayo ya propuso: revisa
// ética (¿cuida el vínculo o cruza a presión/manipulación?) y eficacia (¿rebota?).
// Opt-in (Aaron pulsa "Pedir una crítica") → sin doble latencia por defecto.

import { NextResponse, type NextRequest } from 'next/server'

import { complete } from '@/lib/llm'
import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { CRITIQUE_SYSTEM_PROMPT, buildCritiqueInput, parseCritique, type CritiqueInput } from '@/lib/influence/critiquePrompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let b: Partial<CritiqueInput>
  try { b = (await req.json()) as Partial<CritiqueInput> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const input: CritiqueInput = {
    personName: typeof b.personName === 'string' ? b.personName : 'la persona',
    objective: typeof b.objective === 'string' ? b.objective : '',
    read: typeof b.read === 'string' ? b.read : '',
    opener: typeof b.opener === 'string' ? b.opener : '',
    actions: Array.isArray(b.actions) ? b.actions.filter((x): x is string => typeof x === 'string') : [],
  }
  if (!input.objective && !input.read && !input.opener && input.actions.length === 0) {
    return NextResponse.json({ error: 'Nada que criticar' }, { status: 400 })
  }

  try {
    const res = await complete(
      {
        task: 'rehearse_critique', tier: 'balanced', sensitivity: 'third_party', maxTokens: 400,
        system: CRITIQUE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildCritiqueInput(input) }],
      },
      { supabase, userId: auth.user.id },
    )
    const critique = parseCritique(res.text)
    if (!critique) return NextResponse.json({ error: 'Respuesta vacía del modelo', detail: 'Reinténtalo en un momento.' }, { status: 502 })
    return NextResponse.json({ critique })
  } catch (e) {
    reportApiError(e, { route: 'influence/rehearse/critique' })
    return NextResponse.json({ error: 'No se pudo generar la crítica', detail: 'Reinténtalo en un momento.' }, { status: 502 })
  }
}
