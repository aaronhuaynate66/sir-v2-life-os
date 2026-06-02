// SIR V2 — GET/POST /api/calendar/connections (Calendar v2 Fase 1)
//
// Gestión de los calendarios conectados del usuario (tabla calendar_connections,
// migration 0046, RLS por user_id). Auth-gated: es la agenda personal del dueño.
//
// SENSIBLE: ics_url lleva un token privado del feed → NUNCA se loguea (ni en
// console ni en Sentry: reportApiError captura la excepción, jamás el body).
// Se devuelve al dueño para que pueda editarlo (mismo criterio que
// person-sensitive), pero no se expone fuera de su sesión (RLS).
//
// TOLERANTE: si la tabla aún no existe (migración sin correr), GET devuelve
// lista vacía en vez de 500 — la UI muestra "conectá tu calendario" y el reader
// sigue cayendo al fallback OUTLOOK_ICS_URL. No rompe lo actual.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import {
  rowToDto,
  normalizeColor,
  normalizeLabel,
  validateIcsUrl,
  type CalendarConnectionRow,
} from '@/lib/calendar/connections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT_COLS = 'id, label, provider, ics_url, color, enabled, created_at'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function GET() {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  try {
    const { data, error } = await supabase
      .from('calendar_connections')
      .select(SELECT_COLS)
      .order('created_at', { ascending: true })
    // Tabla ausente / cualquier error de lectura → lista vacía (tolerante).
    if (error) return NextResponse.json({ connections: [] })
    const connections = (data as CalendarConnectionRow[]).map(rowToDto)
    return NextResponse.json({ connections })
  } catch {
    return NextResponse.json({ connections: [] })
  }
}

interface PostBody {
  label?: unknown
  icsUrl?: unknown
  color?: unknown
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return errorJson(400, 'Body inválido')
  }

  const urlCheck = validateIcsUrl(body.icsUrl)
  if (!urlCheck.ok) return errorJson(400, urlCheck.reason ?? 'URL inválida')

  try {
    const { data, error } = await supabase
      .from('calendar_connections')
      .insert({
        user_id: userId,
        label: normalizeLabel(body.label),
        provider: 'ics',
        ics_url: urlCheck.url,
        color: normalizeColor(body.color),
        enabled: true,
        updated_at: new Date().toISOString(),
      })
      .select(SELECT_COLS)
      .maybeSingle()
    if (error) {
      // No incluimos la URL (sensible) en el detalle.
      return errorJson(500, 'No se pudo guardar el calendario', error.message.slice(0, 200))
    }
    return NextResponse.json({ connection: rowToDto(data as CalendarConnectionRow) }, { status: 201 })
  } catch (e) {
    reportApiError(e) // captura la excepción, NO el payload (token)
    return errorJson(500, 'No se pudo guardar el calendario')
  }
}
