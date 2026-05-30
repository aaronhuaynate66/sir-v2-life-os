// SIR V2 — GET /api/people/search
//
// Person matcher para el flujo de captura. Recibe ?q=...&capture_type=...
// y devuelve candidatos rankeados.
//
// La logica de ranking + normalizaciones vive en src/lib/people/matcher.ts
// (compartida con /api/capture/process). Aca solo parseamos el query y
// armamos signals.
//
// Auth: requiere sesion activa. RLS protege que solo se busquen las
// personas del user actual.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import {
  findCandidates,
  normalizeName,
  type MatcherSignals,
  type ScoredCandidate,
} from '@/lib/people/matcher'
import type { CaptureType } from '@/lib/capture/observations/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SearchResponse {
  candidates: ScoredCandidate[]
  normalizedQuery: string
}

interface ErrorBody {
  error: string
  detail?: string
}

const VALID_CAPTURE_TYPES: ReadonlySet<CaptureType> = new Set([
  'whatsapp_chat',
  'whatsapp_info',
  'instagram',
  'linkedin',
  'manual_note',
  'voice_note',
  'unknown',
])

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

/**
 * Heuristicas livianas para decidir, a partir de un string libre, en que
 * señal del matcher ponerlo. El usuario tipea "@diana.c" y queremos que
 * funcione como handle; tipea "+51 999..." y queremos que sea phone.
 */
function inferSignals(q: string, captureType: CaptureType | null): MatcherSignals {
  const trimmed = q.trim()
  if (!trimmed) return {}

  // Telefono: arranca con + o son mayormente digitos.
  const digitOnly = trimmed.replace(/[^\d]/g, '')
  if (trimmed.startsWith('+') || (digitOnly.length >= 7 && digitOnly.length / trimmed.length >= 0.6)) {
    return { phone: trimmed }
  }

  // Handle: arranca con @ o no contiene espacios pero si '.' o '_'.
  if (trimmed.startsWith('@')) {
    return { handle: trimmed }
  }
  if (
    !trimmed.includes(' ') &&
    /[._]/.test(trimmed) &&
    /^[a-zA-Z0-9._-]+$/.test(trimmed) &&
    captureType === 'instagram'
  ) {
    return { handle: trimmed }
  }

  // LinkedIn URL.
  if (trimmed.toLowerCase().includes('linkedin.com/')) {
    return { linkedinUrl: trimmed }
  }

  return { name: trimmed }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const url = new URL(req.url)
  const qRaw = url.searchParams.get('q') ?? ''
  const captureTypeRaw = url.searchParams.get('capture_type')

  const q = normalizeName(qRaw)
  if (q.length < 2) {
    return NextResponse.json({ candidates: [], normalizedQuery: q } satisfies SearchResponse, {
      status: 200,
    })
  }

  if (captureTypeRaw && !VALID_CAPTURE_TYPES.has(captureTypeRaw as CaptureType)) {
    return errorJson(400, 'capture_type invalido', captureTypeRaw)
  }
  const captureType = (captureTypeRaw as CaptureType | null) ?? null

  const signals = inferSignals(qRaw, captureType)
  const { candidates } = await findCandidates(supabase, authData.user.id, signals)

  return NextResponse.json(
    { candidates, normalizedQuery: q } satisfies SearchResponse,
    { status: 200 },
  )
}
