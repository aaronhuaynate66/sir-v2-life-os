// SIR V2 — GET /api/people/search
//
// Person matcher para el flujo de captura. Recibe ?q=...&capture_type=...
// y devuelve candidatos rankeados.
//
// Search strategy:
//   1. Strip emojis del query.
//   2. Buscar contra columnas:
//        name, alias, slug (siempre)
//        instagram_handle (si capture_type='instagram' o nombre arranca con @)
//        linkedin_url     (si capture_type='linkedin' o contiene 'linkedin.com')
//        phone_number     (si capture_type='whatsapp_*' y query parece numero)
//   3. Match: substring case-insensitive (ilike).
//   4. Rank por afinidad:
//        - exact match en name/alias -> 100
//        - prefix match               -> 80
//        - substring match            -> 50
//        - match en handle/url        -> 70
//   5. Devolver top 10.
//
// Auth: requiere sesion activa. RLS asegura que solo se buscan las
// personas del user actual.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import type { CaptureType } from '@/lib/capture/observations/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PersonCandidate {
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

interface SearchResponse {
  candidates: PersonCandidate[]
  /** Echo del query normalizado para que la UI muestre que se busco. */
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

function normalize(s: string): string {
  return s
    .replace(/[^\p{L}\p{N}@._\s'-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface PeopleRow {
  id: string
  name: string | null
  slug: string | null
  alias: string | null
  relationship: string | null
  category: string | null
  importance_score: number | null
  instagram_handle: string | null
  linkedin_url: string | null
  phone_number: string | null
}

function score(row: PeopleRow, q: string): { score: number; reason: string } {
  const lq = q.toLowerCase()
  const name = String(row.name ?? '').toLowerCase()
  const alias = String(row.alias ?? '').toLowerCase()
  const slug = String(row.slug ?? '').toLowerCase()
  const handle = String(row.instagram_handle ?? '').toLowerCase()
  const linkedin = String(row.linkedin_url ?? '').toLowerCase()
  const phone = String(row.phone_number ?? '').toLowerCase()

  if (name === lq || alias === lq) return { score: 100, reason: 'exact_name' }
  if (slug === lq) return { score: 95, reason: 'exact_slug' }
  if (handle && handle === lq.replace(/^@/, ''))
    return { score: 90, reason: 'exact_handle' }
  if (linkedin && linkedin.includes(lq) && lq.length >= 4)
    return { score: 85, reason: 'linkedin_url' }
  if (phone && phone.replace(/[^\d]/g, '').includes(lq.replace(/[^\d]/g, '')) && lq.replace(/[^\d]/g, '').length >= 5)
    return { score: 80, reason: 'phone' }
  if (name.startsWith(lq) || alias.startsWith(lq))
    return { score: 70, reason: 'name_prefix' }
  if (handle && handle.startsWith(lq.replace(/^@/, '')))
    return { score: 65, reason: 'handle_prefix' }
  if (name.includes(lq) || alias.includes(lq))
    return { score: 50, reason: 'name_substring' }
  if (handle && handle.includes(lq.replace(/^@/, '')))
    return { score: 45, reason: 'handle_substring' }
  return { score: 0, reason: 'no_match' }
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

  const q = normalize(qRaw)
  if (q.length < 2) {
    return NextResponse.json({ candidates: [], normalizedQuery: q } satisfies SearchResponse, {
      status: 200,
    })
  }

  if (captureTypeRaw && !VALID_CAPTURE_TYPES.has(captureTypeRaw as CaptureType)) {
    return errorJson(400, 'capture_type invalido', captureTypeRaw)
  }

  // Volumen esperado <500 personas — fetch all + filter en memoria.
  // RLS deja pasar solo las del user actual.
  const { data, error } = await supabase
    .from('people')
    .select(
      'id, name, slug, alias, relationship, category, importance_score, instagram_handle, linkedin_url, phone_number',
    )
    .eq('user_id', authData.user.id)

  if (error || !data) {
    return errorJson(500, 'No se pudieron leer las personas', error?.message)
  }

  const rows = data as unknown as PeopleRow[]
  const scored: PersonCandidate[] = rows
    .map((row) => {
      const { score: s, reason } = score(row, q)
      if (s === 0) return null
      const cand: PersonCandidate = {
        id: row.id,
        name: row.name ?? '(sin nombre)',
        slug: row.slug,
        alias: row.alias,
        relationship: row.relationship,
        category: row.category,
        importance_score: row.importance_score,
        instagram_handle: row.instagram_handle,
        linkedin_url: row.linkedin_url,
        phone_number: row.phone_number,
        matchScore: s,
        matchReason: reason,
      }
      return cand
    })
    .filter((c): c is PersonCandidate => c !== null)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10)

  return NextResponse.json(
    { candidates: scored, normalizedQuery: q } satisfies SearchResponse,
    { status: 200 },
  )
}
