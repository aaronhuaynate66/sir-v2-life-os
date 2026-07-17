// SIR V2 — POST /api/relaciones/moment-check { person_id }
//
// Cruza los TEMAS ABIERTOS (relationship_moments) de una persona con su chat
// reciente y devuelve SUGERENCIAS de cuáles ya parecen resueltos (con la frase
// del chat como evidencia). NO cierra nada — el usuario confirma en la ficha.
// Fail-open: cualquier error → sin sugerencias (no rompe el panel).

import { NextResponse, type NextRequest } from 'next/server'

import { complete } from '@/lib/llm'
import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import {
  RESOLUTION_SYSTEM_PROMPT,
  buildResolutionInput,
  parseResolutionVerdicts,
  suggestedResolutions,
  type OpenMomentLite,
  type ChatLine,
} from '@/lib/moments/resolutionCheck'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const RECENT_MSG_LIMIT = 50

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  let body: { person_id?: unknown }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ suggestions: [] }) }
  const personId = typeof body.person_id === 'string' ? body.person_id : ''
  if (!personId) return NextResponse.json({ suggestions: [] })

  try {
    const [{ data: momentRows }, { data: personRow }, { data: msgRows }] = await Promise.all([
      supabase
        .from('relationship_moments')
        .select('id, title, detail')
        .eq('user_id', userId).eq('person_id', personId).eq('status', 'abierto')
        .limit(20),
      supabase.from('people').select('name').eq('user_id', userId).eq('id', personId).maybeSingle(),
      supabase
        .from('chat_messages')
        .select('sent_at, sender, content')
        .eq('user_id', userId).eq('person_id', personId)
        .order('sent_at', { ascending: false })
        .limit(RECENT_MSG_LIMIT),
    ])

    const moments: OpenMomentLite[] = (momentRows ?? []).map((r) => {
      const m = r as Record<string, unknown>
      return { id: String(m.id ?? ''), title: String(m.title ?? ''), detail: (m.detail as string | null) ?? null }
    }).filter((m) => m.id && m.title)
    if (moments.length === 0) return NextResponse.json({ suggestions: [] })

    const name = ((personRow as { name?: string } | null)?.name) || 'la persona'
    const lines: ChatLine[] = (msgRows ?? [])
      .map((r) => {
        const m = r as Record<string, unknown>
        return {
          who: m.sender === 'user' ? 'Aaron' : name,
          date: String(m.sent_at ?? '').slice(0, 10),
          text: String(m.content ?? '').slice(0, 300),
        }
      })
      .filter((l) => l.text)
      .reverse() // cronológico
    if (lines.length === 0) return NextResponse.json({ suggestions: [] })

    const res = await complete(
      {
        task: 'moment_resolution', tier: 'balanced', sensitivity: 'third_party', maxTokens: 500,
        system: RESOLUTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildResolutionInput(moments, name, lines) }],
      },
      { supabase, userId },
    )
    const verdicts = parseResolutionVerdicts(res.text, moments.map((m) => m.id))
    const suggestions = suggestedResolutions(verdicts).map((v) => ({
      momentId: v.momentId, evidence: v.evidence, confidence: v.confidence,
    }))
    return NextResponse.json({ suggestions })
  } catch (e) {
    reportApiError(e, { route: 'relaciones/moment-check' })
    return NextResponse.json({ suggestions: [] })
  }
}
