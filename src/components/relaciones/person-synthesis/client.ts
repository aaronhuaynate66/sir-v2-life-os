// SIR V2 — Browser-side wrapper de POST /api/person-synthesis.

'use client'

import { parseErrorResponse, type ApiError } from '@/lib/api/errors'
import type { PersonSynthesis } from '@/lib/person-synthesis/types'

/** Alias del tipo de error compartido (mantiene el nombre histórico). */
export type GenerateSynthesisError = ApiError

export async function generatePersonSynthesis(personId: string): Promise<PersonSynthesis> {
  const res = await fetch('/api/person-synthesis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person_id: personId }),
  })
  if (!res.ok) throw await parseErrorResponse(res)
  const json = (await res.json()) as { synthesis: PersonSynthesis }
  return json.synthesis
}
