// SIR V2 — Browser-side wrapper de POST /api/person-synthesis.

'use client'

import type { PersonSynthesis } from '@/lib/person-synthesis/types'

export interface GenerateSynthesisError {
  status: number
  message: string
  detail?: string
}

export async function generatePersonSynthesis(personId: string): Promise<PersonSynthesis> {
  const res = await fetch('/api/person-synthesis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person_id: personId }),
  })
  if (!res.ok) {
    let body: { error?: string; detail?: string } = {}
    try {
      body = await res.json()
    } catch {
      /* sin body */
    }
    const err: GenerateSynthesisError = {
      status: res.status,
      message: body.error ?? `HTTP ${res.status}`,
      detail: body.detail,
    }
    throw err
  }
  const json = (await res.json()) as { synthesis: PersonSynthesis }
  return json.synthesis
}
