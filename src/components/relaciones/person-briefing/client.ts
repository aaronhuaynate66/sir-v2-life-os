// SIR V2 — Browser-side wrapper de POST /api/person-briefing.

'use client'

import { parseErrorResponse, type ApiError } from '@/lib/api/errors'

/** Alias del tipo de error compartido (mantiene el nombre histórico). */
export type GenerateBriefingError = ApiError

export async function generatePersonBriefing(personId: string): Promise<string> {
  const res = await fetch('/api/person-briefing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person_id: personId }),
  })
  if (!res.ok) throw await parseErrorResponse(res)
  const json = (await res.json()) as { briefing: string }
  return json.briefing
}
