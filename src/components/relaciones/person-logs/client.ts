// SIR V2 — Browser-side wrapper de POST /api/person-logs.

'use client'

import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'

export interface CreatePersonLogInput {
  personId: string
  kind: PersonLogKind
  value: number
  note?: string
}

export interface CreatePersonLogError {
  status: number
  message: string
  detail?: string
}

export async function createPersonLog(
  input: CreatePersonLogInput,
): Promise<PersonLog> {
  const res = await fetch('/api/person-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      person_id: input.personId,
      kind: input.kind,
      value: input.value,
      ...(input.note ? { note: input.note } : {}),
    }),
  })
  if (!res.ok) {
    let body: { error?: string; detail?: string } = {}
    try {
      body = await res.json()
    } catch {
      /* sin body */
    }
    const err: CreatePersonLogError = {
      status: res.status,
      message: body.error ?? `HTTP ${res.status}`,
      detail: body.detail,
    }
    throw err
  }
  const json = (await res.json()) as { log: PersonLog }
  return json.log
}
