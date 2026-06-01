// SIR V2 — POST /api/people
//
// Crea un row minimo en `people` cuando el usuario decide vincular una
// captura a una persona NUEVA desde el flujo de /captura.
//
// Body JSON:
//   { name: string, alias?: string,
//     instagram_handle?: string, linkedin_url?: string, phone_number?: string,
//     relationship?: RelationshipType, category?: PersonCategory }
//
// El ID y slug se generan server-side. RLS asegura user_id correcto.
//
// Auth: requiere sesion activa.

import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { ensureUniqueSlug, generateSlug } from '@/lib/people/slug'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface CreatePersonBody {
  name?: unknown
  alias?: unknown
  instagram_handle?: unknown
  linkedin_url?: unknown
  phone_number?: unknown
  relationship?: unknown
  category?: unknown
}

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

const VALID_RELATIONSHIPS = new Set([
  'family',
  'friend',
  'romantic',
  'professional',
  'mentor',
  'mentee',
  'acquaintance',
])
const VALID_CATEGORIES = new Set(['inner_circle', 'close', 'network', 'peripheral'])

function rand(n: number): string {
  return Math.random().toString(36).slice(2, 2 + n)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  let body: CreatePersonBody
  try {
    body = (await req.json()) as CreatePersonBody
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }

  if (typeof body.name !== 'string' || body.name.trim().length === 0) {
    return errorJson(400, 'name requerido')
  }

  const name = body.name.trim().slice(0, 200)
  const alias =
    typeof body.alias === 'string' && body.alias.trim().length > 0
      ? body.alias.trim().slice(0, 200)
      : null
  const instagram_handle =
    typeof body.instagram_handle === 'string' && body.instagram_handle.trim().length > 0
      ? body.instagram_handle.trim().replace(/^@/, '').slice(0, 100)
      : null
  const linkedin_url =
    typeof body.linkedin_url === 'string' && body.linkedin_url.trim().length > 0
      ? body.linkedin_url.trim().slice(0, 500)
      : null
  const phone_number =
    typeof body.phone_number === 'string' && body.phone_number.trim().length > 0
      ? body.phone_number.trim().slice(0, 50)
      : null

  const relationship =
    typeof body.relationship === 'string' && VALID_RELATIONSHIPS.has(body.relationship)
      ? body.relationship
      : 'acquaintance'
  const category =
    typeof body.category === 'string' && VALID_CATEGORIES.has(body.category)
      ? body.category
      : 'peripheral'

  let slug: string
  try {
    slug = await ensureUniqueSlug(generateSlug(name), userId, { client: supabase })
  } catch (e) {
    reportApiError(e)
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(500, 'No se pudo generar slug', msg.slice(0, 200))
  }

  const id = `per_${Date.now()}_${rand(6)}`

  const row = {
    id,
    user_id: userId,
    name,
    slug,
    alias,
    relationship,
    category,
    importance_score: 5,
    energy_impact: 'neutral',
    trust_level: 5,
    contact_frequency: '',
    tags: [],
    notes: '',
    instagram_handle,
    linkedin_url,
    phone_number,
  }

  const { data, error } = await supabase
    .from('people')
    .insert(row)
    .select('id, name, slug, alias, relationship, category, importance_score, instagram_handle, linkedin_url, phone_number')
    .single()

  if (error || !data) {
    return errorJson(500, 'No se pudo crear la persona', error?.message ?? 'sin data')
  }

  return NextResponse.json({ person: data }, { status: 201 })
}
