// SIR V2 — POST /api/health/import
//
// Camino $0 de Apple Health: el usuario sube el JSON del "Manual Export → JSON"
// de Health Auto Export como ARCHIVO desde la app (sin pagar la automatización
// REST API Premium). Difiere de /api/health/ingest SÓLO en el gate de auth:
//
//   - /ingest : webhook sin sesión → gate por TOKEN (HEALTH_INGEST_TOKEN),
//               escribe con SERVICE ROLE y user_id mono-usuario resuelto.
//   - /import : subida autenticada del propio usuario → gate por SESIÓN Supabase
//               (auth.getUser()), escribe con el CLIENTE DE SESIÓN (RLS) y el
//               user_id de la sesión.
//
// Comparten TODO lo demás: el parser puro (mapHealthAutoExport) y el upsert
// idempotente por (user_id, external_id) (migration 0049). Reimportar el mismo
// rango NO duplica. Devuelve las filas escritas para reflejarlas en /yo al toque.

import { NextResponse, type NextRequest } from 'next/server'

import { reportApiError } from '@/lib/observability/reportApiError'
import { createClient } from '@/lib/supabase/server'
import { mapHealthAutoExport } from '@/lib/health/ingest/parse'
import { looksLikeHae } from '@/lib/health/import/payload'
import { summarizeMapping } from '@/lib/health/import/summary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Los exports manuales pueden cubrir rangos largos → más holgura que /ingest.
export const maxDuration = 60

const SOURCE = 'apple_health'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  // 1. Auth por sesión Supabase (cookies). Es la subida del propio usuario.
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  // 2. Body = payload crudo de Health Auto Export.
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return errorJson(400, 'JSON inválido en el body.')
  }
  if (!looksLikeHae(payload)) {
    return errorJson(
      422,
      'No reconozco este archivo como export de Apple Health.',
      'Esperaba { data: { metrics: [...] } } de Health Auto Export (Manual Export → JSON).',
    )
  }

  // 3. Mapear con el parser puro (misma lógica que /ingest).
  const mapped = mapHealthAutoExport(payload)
  const summary = summarizeMapping(mapped)

  if (mapped.healthMetrics.length === 0 && mapped.sleepRecords.length === 0) {
    return NextResponse.json(
      {
        ok: true,
        healthMetrics: 0,
        sleepRecords: 0,
        daysCovered: 0,
        skipped: mapped.skipped,
        healthRows: [],
        sleepRows: [],
      },
      { status: 200 },
    )
  }

  // 4. Upsert idempotente con el cliente de SESIÓN (RLS). onConflict comparte el
  //    arbiter (user_id, external_id) con /ingest → los dos caminos convergen.
  try {
    let healthRows: Record<string, unknown>[] = []
    let sleepRows: Record<string, unknown>[] = []
    const errors: string[] = []

    if (mapped.healthMetrics.length > 0) {
      const rows = mapped.healthMetrics.map((m) => ({
        user_id: userId,
        type: m.type,
        value: m.value,
        unit: m.unit,
        note: m.note ?? null,
        measured_at: m.measuredAt,
        source: SOURCE,
        external_id: m.externalId,
      }))
      const { data, error } = await supabase
        .from('health_metrics')
        .upsert(rows, { onConflict: 'user_id,external_id' })
        .select('*')
      if (error) errors.push(`health_metrics: ${error.message}`)
      else healthRows = (data ?? []) as Record<string, unknown>[]
    }

    if (mapped.sleepRecords.length > 0) {
      const rows = mapped.sleepRecords.map((s) => ({
        user_id: userId,
        date: s.date,
        bedtime: s.bedtime,
        wake_time: s.wakeTime,
        duration: s.duration,
        quality: s.quality,
        notes: s.notes ?? null,
        source: SOURCE,
        external_id: s.externalId,
      }))
      const { data, error } = await supabase
        .from('sleep_records')
        .upsert(rows, { onConflict: 'user_id,external_id' })
        .select('*')
      if (error) errors.push(`sleep_records: ${error.message}`)
      else sleepRows = (data ?? []) as Record<string, unknown>[]
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Falló la escritura de algunas métricas.',
          detail: errors.join(' · '),
          healthMetrics: healthRows.length,
          sleepRecords: sleepRows.length,
        },
        { status: 502 },
      )
    }

    return NextResponse.json(
      {
        ok: true,
        healthMetrics: healthRows.length,
        sleepRecords: sleepRows.length,
        daysCovered: summary.daysCovered,
        skipped: mapped.skipped,
        healthRows,
        sleepRows,
      },
      { status: 200 },
    )
  } catch (e) {
    reportApiError(e, { route: 'health/import' })
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(500, 'Error inesperado al importar.', msg.slice(0, 300))
  }
}
