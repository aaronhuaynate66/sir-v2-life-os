// SIR V2 — POST /api/alter-ego (capa filosófica: qué postura tomar).
//
// Body { situation, personId? }. Selecciona (DETERMINÍSTICO) las corrientes que
// mejor sirven a la situación (con Kant de freno si entra el poder) y, si hay
// ANTHROPIC_API_KEY, agrega una "voz" del alter ego que las aplica al caso. Lo
// determinístico siempre sale; el LLM es opcional. NO diagnostica, NO manipula.

import { complete } from '@/lib/llm'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { logEvent } from '@/lib/observability/logEvent'
import { selectStances } from '@/lib/philosophy/select'
import type { Domain } from '@/lib/philosophy/schools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

function domainFromAmbito(ambito?: string | null, relationship?: string | null): Domain | undefined {
  const a = (ambito ?? '').toLowerCase()
  if (a.includes('profes') || a.includes('labor') || a.includes('trabajo')) return 'profesional'
  if (a.includes('afect') || a.includes('personal') || a.includes('familia')) return 'afectivo'
  const r = (relationship ?? '').toLowerCase()
  if (r === 'professional' || r === 'mentor') return 'profesional'
  if (['family', 'friend', 'romantic'].includes(r)) return 'afectivo'
  return undefined
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  let body: { situation?: unknown; personId?: unknown }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const situation = typeof body.situation === 'string' ? body.situation.trim().slice(0, 1500) : ''
  if (!situation) return NextResponse.json({ error: 'Contame la situación' }, { status: 400 })
  const personId = typeof body.personId === 'string' ? body.personId : ''

  let domain: Domain | undefined
  let personName: string | undefined
  if (personId) {
    const { data: person } = await supabase.from('people').select('name, ambito, relationship').eq('user_id', userId).eq('id', personId).maybeSingle()
    if (person) {
      personName = person.name as string
      domain = domainFromAmbito(person.ambito as string, person.relationship as string)
    }
  }

  const stance = selectStances({ situation, domain, personName })

  const picks = stance.picks.map((p) => ({
    id: p.school.id, name: p.school.name, thinker: p.school.thinker,
    principle: p.school.principle, question: p.school.question, stance: p.school.stance,
    blindSpot: p.school.blindSpot, reason: p.reason, isCheck: !!p.isCheck,
  }))

  // Voz del alter ego (opcional, best-effort) — vía capa llm/. tier capable:
  // postura filosófica para Aaron. Sin proveedor → sin voz (lo determinístico igual sale).
  let voice: string | undefined
  try {
    const list = picks.map((p) => `- ${p.name}${p.isCheck ? ' (freno ético)' : ''}: ${p.stance}`).join('\n')
    const res = await complete(
      {
        task: 'alter_ego', tier: 'capable', sensitivity: 'self', maxTokens: 400,
        system: "Sos el 'alter ego' de Aaron: una voz interior lúcida que lo ayuda a encarar una situación desde una postura filosófica. Hablás en segunda persona, directo, sin floritura ni citas de manual. NO diagnostiques, NO propongas manipular a nadie. Máximo 4 frases: qué postura tomar acá y el PRIMER movimiento concreto.",
        messages: [{ role: 'user', content: `Situación: ${situation}\n\nPosturas que mejor sirven:\n${list}\n\nLínea que no se cruza: ${stance.ethicalLine}\n\nDame la voz del alter ego.` }],
      },
      { supabase, userId },
    )
    voice = res.text.trim() || undefined
  } catch (e) {
    // best-effort: sin voz, igual devolvemos lo determinístico.
    voice = undefined
    void e
  }

  await logEvent(supabase, userId, { type: 'alter-ego', ok: true, route: 'alter-ego', meta: { tags: stance.tags, domain: stance.domain, picks: picks.map((p) => p.id), withVoice: !!voice } })

  return NextResponse.json({ result: { tags: stance.tags, domain: stance.domain, picks, ethicalLine: stance.ethicalLine }, voice })
}
