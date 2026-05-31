// SIR V2 — Browser-side wrapper de POST /api/person-logs.

'use client'

import { parseErrorResponse, type ApiError } from '@/lib/api/errors'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'

export interface CreatePersonLogInput {
  personId: string
  kind: PersonLogKind
  value: number
  note?: string
}

/** Alias del tipo de error compartido (mantiene el nombre histórico). */
export type CreatePersonLogError = ApiError

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
  if (!res.ok) throw await parseErrorResponse(res)
  const json = (await res.json()) as { log: PersonLog }
  return json.log
}
