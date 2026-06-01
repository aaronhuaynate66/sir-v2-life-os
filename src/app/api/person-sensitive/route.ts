// SIR V2 — GET/PUT /api/person-sensitive (información sensible por persona).
//
// Datos de identidad-dura (DNI, pasaporte, foto del documento) — tabla
// person_sensitive_data (1:1 people, migration 0025), RLS por user_id.
//
// MANEJO SENSIBLE:
//   - NO se loguean valores (ni en console ni en Sentry: reportApiError captura
//     la excepción, nunca el body).
//   - Estos datos NO los lee ningún engine / grafo / embedding / síntesis.
//   - Ownership doble: RLS + verificación explícita de que la persona es del
//     usuario antes de leer/escribir.
//
// GET es TOLERANTE: si la tabla aún no existe en prod (migración sin correr),
// devuelve {} en vez de 500 — la sección se muestra vacía y no rompe la ficha.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

interface SensitiveRow {
  documento_tipo: string | null
  documento_numero: string | null
  pasaporte_numero: string | null
  pasaporte_vencimiento: string | null
  foto_documento_path: string | null
}

function toDto(row: Partial<SensitiveRow> | null) {
  return {
    documentoTipo: row?.documento_tipo ?? undefined,
    documentoNumero: row?.documento_numero ?? undefined,
    pasaporteNumero: row?.pasaporte_numero ?? undefined,
    pasaporteVencimiento: row?.pasaporte_vencimiento ?? undefined,
    fotoDocumentoPath: row?.foto_documento_path ?? null,
  }
}

/** Verifica que la persona exista y sea del usuario (RLS la scopea). */
async function ownsPerson(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
): Promise<boolean> {
  const { data } = await supabase.from('people').select('id').eq('id', personId).maybeSingle()
  return !!data
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const personId = req.nextUrl.searchParams.get('personId')?.trim()
  if (!personId) return errorJson(400, 'Falta personId')

  if (!(await ownsPerson(supabase, personId))) {
    return errorJson(404, 'Persona no encontrada')
  }

  // Tolerante: si la tabla no existe (migración pendiente) o cualquier error de
  // lectura, devolvemos vacío para no romper la ficha. No logueamos valores.
  try {
    const { data, error } = await supabase
      .from('person_sensitive_data')
      .select('documento_tipo, documento_numero, pasaporte_numero, pasaporte_vencimiento, foto_documento_path')
      .eq('person_id', personId)
      .maybeSingle()
    if (error) return NextResponse.json(toDto(null))
    return NextResponse.json(toDto(data as SensitiveRow | null))
  } catch {
    return NextResponse.json(toDto(null))
  }
}

interface PutBody {
  personId?: unknown
  documentoTipo?: unknown
  documentoNumero?: unknown
  pasaporteNumero?: unknown
  pasaporteVencimiento?: unknown
  fotoDocumentoPath?: unknown
}

function cleanStr(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  let body: PutBody
  try {
    body = (await req.json()) as PutBody
  } catch {
    return errorJson(400, 'Body inválido')
  }

  const personId = cleanStr(body.personId, 80)
  if (!personId) return errorJson(400, 'Falta personId')

  if (!(await ownsPerson(supabase, personId))) {
    return errorJson(404, 'Persona no encontrada')
  }

  // pasaporte_vencimiento: date 'YYYY-MM-DD' o null.
  const venc = cleanStr(body.pasaporteVencimiento, 10)
  const vencValid = venc && /^\d{4}-\d{2}-\d{2}$/.test(venc) ? venc : null

  try {
    const { data, error } = await supabase
      .from('person_sensitive_data')
      .upsert(
        {
          person_id: personId,
          user_id: userId,
          documento_tipo: cleanStr(body.documentoTipo),
          documento_numero: cleanStr(body.documentoNumero),
          pasaporte_numero: cleanStr(body.pasaporteNumero),
          pasaporte_vencimiento: vencValid,
          foto_documento_path: cleanStr(body.fotoDocumentoPath, 400),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'person_id' },
      )
      .select('documento_tipo, documento_numero, pasaporte_numero, pasaporte_vencimiento, foto_documento_path')
      .maybeSingle()
    if (error) {
      // No incluimos el body (sensible) en el detalle.
      return errorJson(500, 'No se pudo guardar', error.message.slice(0, 200))
    }
    return NextResponse.json(toDto(data as SensitiveRow | null))
  } catch (e) {
    reportApiError(e) // captura la excepción, NO el payload sensible
    return errorJson(500, 'No se pudo guardar')
  }
}
