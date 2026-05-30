// SIR V2 — Browser-side wrapper de POST /api/person-briefing.

'use client'

export interface GenerateBriefingError {
  status: number
  message: string
  detail?: string
}

export async function generatePersonBriefing(personId: string): Promise<string> {
  const res = await fetch('/api/person-briefing', {
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
    const err: GenerateBriefingError = {
      status: res.status,
      message: body.error ?? `HTTP ${res.status}`,
      detail: body.detail,
    }
    throw err
  }
  const json = (await res.json()) as { briefing: string }
  return json.briefing
}
