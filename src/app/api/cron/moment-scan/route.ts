// SIR V2 — GET /api/cron/moment-scan (cruce chat → temas abiertos, PROACTIVO).
//
// Fricción de Aaron (17/07): un tema ABIERTO (el examen del seguro de Diana)
// seguía 'abierto' aunque el chat YA decía que se resolvió → "SIR no cruza bien
// la info". Este cron corre ANTES del morning-push: por cada persona con temas
// abiertos y chat reciente, le pregunta al modelo si el chat ya los resolvió
// (evidencia textual, conservador) y GUARDA la sugerencia en la fila del moment.
// El push la lee determinístico (sin LLM → cero latencia/502, su diseño).
//
// SIR SUGIERE cerrar; NUNCA cierra solo (un falso positivo no debe borrar un
// tema real). Conservador y acotado: tope de personas por usuario para no gastar
// de más. Auth: CRON_SECRET. Service-role. Telemetría por task='moment_resolution'.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { complete } from '@/lib/llm'
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
export const maxDuration = 300

const MAX_MOMENTS = 60 // temas abiertos por usuario a revisar
const MAX_PERSONS = 12 // personas por usuario a las que gastamos una llamada
const RECENT_MSG_LIMIT = 50

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET no configurada' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Faltan envs del server' }, { status: 500 })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // Usuarios con al menos un tema abierto.
  const { data: userRows } = await admin
    .from('relationship_moments').select('user_id').eq('status', 'abierto').limit(5000)
  const userIds = [...new Set((userRows ?? []).map((r) => (r as { user_id: string }).user_id).filter(Boolean))]

  const tally = { users: 0, persons: 0, suggested: 0, cleared: 0, error: 0 }
  for (const userId of userIds) {
    try {
      const { data: momentRows } = await admin
        .from('relationship_moments')
        .select('id, person_id, title, detail')
        .eq('user_id', userId).eq('status', 'abierto')
        .limit(MAX_MOMENTS)

      // Agrupar por persona (una llamada por persona, con todos sus temas juntos).
      const byPerson = new Map<string, OpenMomentLite[]>()
      for (const r of momentRows ?? []) {
        const m = r as Record<string, unknown>
        const personId = String(m.person_id ?? '')
        const id = String(m.id ?? '')
        const title = String(m.title ?? '')
        if (!personId || !id || !title) continue
        const lite: OpenMomentLite = { id, title, detail: (m.detail as string | null) ?? null }
        const arr = byPerson.get(personId)
        if (arr) arr.push(lite)
        else byPerson.set(personId, [lite])
      }

      let scanned = 0
      for (const [personId, moments] of byPerson) {
        if (scanned >= MAX_PERSONS) break

        const [{ data: personRow }, { data: msgRows }] = await Promise.all([
          admin.from('people').select('name').eq('user_id', userId).eq('id', personId).maybeSingle(),
          admin
            .from('chat_messages')
            .select('sent_at, sender, content')
            .eq('user_id', userId).eq('person_id', personId)
            .order('sent_at', { ascending: false })
            .limit(RECENT_MSG_LIMIT),
        ])

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
        if (lines.length === 0) continue // sin chat reciente no hay nada que cruzar
        scanned++

        const res = await complete(
          {
            task: 'moment_resolution', tier: 'balanced', sensitivity: 'third_party', maxTokens: 500,
            system: RESOLUTION_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: buildResolutionInput(moments, name, lines) }],
          },
          { supabase: admin, userId },
        )
        const verdicts = parseResolutionVerdicts(res.text, moments.map((m) => m.id))
        const suggestedById = new Map(suggestedResolutions(verdicts).map((v) => [v.momentId, v]))
        const checkedAt = new Date().toISOString()

        // Escribir el veredicto en CADA tema revisado: los resueltos quedan
        // marcados; los que NO se pueden re-limpiar (una sugerencia vieja que ya
        // no aplica no debe quedar prendida). Actualizamos solo lo revisado.
        for (const m of moments) {
          const sug = suggestedById.get(m.id)
          const { error } = await admin
            .from('relationship_moments')
            .update({
              resolution_suggested: !!sug,
              resolution_evidence: sug ? sug.evidence : null,
              resolution_confidence: sug ? sug.confidence : null,
              resolution_checked_at: checkedAt,
            })
            .eq('id', m.id).eq('user_id', userId)
          if (!error) {
            if (sug) tally.suggested++
            else tally.cleared++
          }
        }
      }
      tally.persons += scanned
      tally.users++
    } catch {
      tally.error++
    }
  }

  return NextResponse.json({ ok: true, users: userIds.length, tally }, { status: 200 })
}
