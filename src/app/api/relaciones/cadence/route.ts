// SIR V2 — GET /api/relaciones/cadence.
//
// Cadencia "automática" sugerida por persona: el ritmo REAL de contacto (mediana
// de gaps entre chats + interacciones + último contacto), cuando hay señal
// robusta; si no, el default por categoría. Lo consume la lista de /relaciones
// para que la etiqueta "auto" coincida con el overdue que ve Reconectar
// (/api/daily-actions usa el MISMO helper puro `suggestCadenceDays`).
//
// Lecturas RLS-scoped (+ .eq('user_id') defensivo). Sin escrituras.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { personAdapter } from '@/lib/supabase/sync/adapters/relationships'
import { suggestCadenceDays, type CadenceSuggestion } from '@/lib/people/cadence'
import type { Person } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

interface CadenceResponse {
  cadence: Record<string, CadenceSuggestion>
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const userId = authData.user.id
  const now = new Date()

  try {
    const [peopleRes, chatsRes, logsRes] = await Promise.all([
      supabase.from('people').select('*').eq('user_id', userId),
      supabase
        .from('observations')
        .select('person_id, observed_at')
        .eq('user_id', userId)
        .in('capture_type', ['whatsapp_chat', 'whatsapp_web'])
        .eq('is_obsolete', false)
        .not('person_id', 'is', null),
      supabase
        .from('person_logs')
        .select('person_id, logged_at')
        .eq('user_id', userId)
        .eq('kind', 'interaction'),
    ])

    const people: Person[] = (peopleRes.data ?? []).map((r) =>
      personAdapter.fromRow(r as Record<string, unknown>),
    )

    const datesByPerson = new Map<string, string[]>()
    const push = (pid: string | null | undefined, iso: string | null | undefined) => {
      if (!pid || !iso) return
      const arr = datesByPerson.get(pid) ?? []
      arr.push(iso)
      datesByPerson.set(pid, arr)
    }
    for (const row of (chatsRes.data ?? []) as Array<{ person_id: string | null; observed_at: string }>) {
      push(row.person_id, row.observed_at)
    }
    for (const row of (logsRes.data ?? []) as Array<{ person_id: string; logged_at: string }>) {
      push(row.person_id, row.logged_at)
    }

    const cadence: Record<string, CadenceSuggestion> = {}
    for (const person of people) {
      const dates = [...(datesByPerson.get(person.id) ?? []), person.lastContact ?? null]
      cadence[person.id] = suggestCadenceDays(dates, person.category, now)
    }

    return NextResponse.json({ cadence } satisfies CadenceResponse, { status: 200 })
  } catch (e) {
    reportApiError(e, { route: 'relaciones/cadence' })
    return NextResponse.json({ error: 'No se pudo calcular la cadencia' }, { status: 500 })
  }
}
