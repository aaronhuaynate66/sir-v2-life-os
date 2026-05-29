// SIR V2 — Cliente para /api/capture/process, /api/people/search y /api/people.
//
// Browser-side helpers, complementan src/lib/capture/detector/client.ts.
// Mantienen una API pequeña y tipada para que la test page /captura
// (PASO 7) ejecute el flujo end-to-end:
//
//   detect -> searchPeople -> (optional createPerson) -> processCapture
//
// Auth: las cookies de Supabase viajan automaticamente con fetch().

'use client'

import type { CaptureType, DetectorResult, Observation } from './types'

export interface PersonCandidate {
  id: string
  name: string
  slug: string | null
  alias: string | null
  relationship: string | null
  category: string | null
  importance_score: number | null
  instagram_handle: string | null
  linkedin_url: string | null
  phone_number: string | null
  matchScore: number
  matchReason: string
}

export interface PeopleSearchResponse {
  candidates: PersonCandidate[]
  normalizedQuery: string
}

export interface CreatePersonInput {
  name: string
  alias?: string
  instagram_handle?: string
  linkedin_url?: string
  phone_number?: string
  relationship?: string
  category?: string
}

export interface CreatePersonResponse {
  person: {
    id: string
    name: string
    slug: string | null
    alias: string | null
    relationship: string | null
    category: string | null
    importance_score: number | null
    instagram_handle: string | null
    linkedin_url: string | null
    phone_number: string | null
  }
}

export interface ProcessCaptureInput {
  /** WebP comprimido (mismo Blob que se mando al detector). */
  file: Blob
  captureType: CaptureType
  detectorData?: DetectorResult
  personId?: string | null
  /** Para whatsapp_chat: encender reflectionQuestions. */
  reflection?: boolean
}

export interface ProcessCaptureResponse {
  observation: Observation
  /** Output sanitizado del extractor (shape varia por capture_type). */
  extracted: Record<string, unknown>
  raw: string
}

class HttpError extends Error {
  status: number
  detail?: string
  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.detail = detail
  }
}

async function readErrorBody(res: Response): Promise<{ error: string; detail?: string }> {
  try {
    return (await res.json()) as { error: string; detail?: string }
  } catch {
    return { error: `HTTP ${res.status}` }
  }
}

// ─── searchPeople ───────────────────────────────────────────────────

export async function searchPeople(
  query: string,
  opts: { captureType?: CaptureType; signal?: AbortSignal } = {},
): Promise<PeopleSearchResponse> {
  const params = new URLSearchParams({ q: query })
  if (opts.captureType) params.set('capture_type', opts.captureType)
  const res = await fetch(`/api/people/search?${params.toString()}`, {
    method: 'GET',
    signal: opts.signal,
  })
  if (!res.ok) {
    const body = await readErrorBody(res)
    throw new HttpError(res.status, body.error, body.detail)
  }
  return (await res.json()) as PeopleSearchResponse
}

// ─── createPerson ───────────────────────────────────────────────────

export async function createPerson(
  input: CreatePersonInput,
): Promise<CreatePersonResponse> {
  const res = await fetch('/api/people', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = await readErrorBody(res)
    throw new HttpError(res.status, body.error, body.detail)
  }
  return (await res.json()) as CreatePersonResponse
}

// ─── processCapture ─────────────────────────────────────────────────

export async function processCapture(
  input: ProcessCaptureInput,
  signal?: AbortSignal,
): Promise<ProcessCaptureResponse> {
  const formData = new FormData()
  formData.append('file', input.file, 'capture.webp')
  formData.append('capture_type', input.captureType)
  if (input.detectorData) {
    formData.append('detector_data', JSON.stringify(input.detectorData))
  }
  if (input.personId) {
    formData.append('person_id', input.personId)
  }
  if (input.reflection) {
    formData.append('reflection', 'true')
  }

  const res = await fetch('/api/capture/process', {
    method: 'POST',
    body: formData,
    signal,
  })
  if (!res.ok) {
    const body = await readErrorBody(res)
    throw new HttpError(res.status, body.error, body.detail)
  }
  return (await res.json()) as ProcessCaptureResponse
}

export { HttpError }
