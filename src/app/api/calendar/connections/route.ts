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
// lista vacía en vez de 500 — la UI muestra "conecta tu calendario" y el reader
// sigue cayendo al fallback OUTLOOK_ICS_URL. No rompe lo actual.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import {
  rowToDto,
  normalizeColor,
  normalizeLabel,
  normalizeKind,
  validateIcsUrl,
  type CalendarConnectionRow,
} from '@/lib/calendar/connections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT_COLS = 'id, label, provider, ics_url, color, enabled, created_at, kind'
// Sin `kind`: fallback si la migración 0137 aún no corrió (no rompe la UI).
const SELECT_COLS_LEGACY = 'id, label, provider, ics_url, color, enabled, created_at'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function GET() {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  }

  try {
    const primary = await supabase
      .from('calendar_connections')
      .select(SELECT_COLS)
      .order('created_at', { ascending: true })
    let rows = primary.data as unknown as CalendarConnectionRow[] | null
    let readError = primary.error
    // Columna `kind` ausente (migración 0137 sin correr) → reintenta sin ella,
    // así las conexiones existentes (ej. HNG) NO desaparecen de la UI.
    if (readError) {
      const legacy = await supabase
        .from('calendar_connections')
        .select(SELECT_COLS_LEGACY)
        .order('created_at', { ascending: true })
      rows = legacy.data as unknown as CalendarConnectionRow[] | null
      readError = legacy.error
    }
    // Tabla ausente / cualquier error de lectura → lista vacía (tolerante).
    if (readError || !rows) return NextResponse.json({ connections: [] })
    const connections = rows.map(rowToDto)
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
    return errorJson(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
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
      // Legacy cols: una conexión nueva es 'work' por default (rowToDto lo asume),
      // así el POST no depende de que la migración 0137 ya haya corrido.
      .select(SELECT_COLS_LEGACY)
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
