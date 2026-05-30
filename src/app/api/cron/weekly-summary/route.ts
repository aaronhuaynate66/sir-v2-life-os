// SIR V2 — GET /api/cron/weekly-summary (Fase 3c, cron automático)
//
// Generación AUTOMÁTICA del resumen semanal. Lo dispara Vercel Cron (ver
// vercel.json, lunes 13:00 UTC ≈ 08:00 Lima). No hay sesión de usuario:
//   - Auth via CRON_SECRET (Vercel manda Authorization: Bearer <CRON_SECRET>
//     a las invocaciones de cron si la env está seteada). Si CRON_SECRET no
//     está, REHUSAMOS correr (el endpoint quedaría sin proteger).
//   - Cliente service-role (SUPABASE_SERVICE_ROLE_KEY) para iterar usuarios;
//     la lógica de generación filtra por user_id explícito (acotado a mano).
//   - skipIfExists: no duplica si ya hay un resumen para el período.
//
// ACCIONES MANUALES (env en Vercel): CRON_SECRET (nuevo) + asegurar que
// SUPABASE_SERVICE_ROLE_KEY esté en el entorno de producción.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { generateWeeklySummaryForUser, type GenerateStatus } from '@/lib/longitudinal/generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DAY_MS = 86_400_000
const USER_SCAN_LIMIT = 2000

export async function GET(req: NextRequest) {
  // 1. Auth por CRON_SECRET.
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET no configurada — el cron no corre sin protección.' },
      { status: 500 },
    )
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Service-role client (sin sesión; iteramos usuarios).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el server.' },
      { status: 500 },
    )
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // 3. Usuarios con actividad en los últimos 7 días (union de las 3 fuentes).
  const startTsIso = new Date(Date.now() - 7 * DAY_MS).toISOString()
  const userIds = new Set<string>()
  const sources: Array<{ table: string; col: string }> = [
    { table: 'person_logs', col: 'logged_at' },
    { table: 'observations', col: 'observed_at' },
    { table: 'memories', col: 'occurred_at' },
  ]
  for (const s of sources) {
    const { data, error } = await admin
      .from(s.table)
      .select('user_id')
      .gte(s.col, startTsIso)
      .limit(USER_SCAN_LIMIT)
    if (error) continue
    for (const row of (data ?? []) as Array<{ user_id: string | null }>) {
      if (row.user_id) userIds.add(row.user_id)
    }
  }

  // 4. Generar por usuario (no duplica si ya existe el período).
  const tally: Record<GenerateStatus, number> = {
    ok: 0, empty: 0, skipped_exists: 0, no_api_key: 0, read_error: 0, llm_error: 0, insert_error: 0,
  }
  for (const userId of userIds) {
    try {
      const r = await generateWeeklySummaryForUser(admin, userId, { days: 7, skipIfExists: true })
      tally[r.status] = (tally[r.status] ?? 0) + 1
    } catch {
      tally.insert_error = (tally.insert_error ?? 0) + 1
    }
  }

  return NextResponse.json({ ok: true, users: userIds.size, tally }, { status: 200 })
}
