// SIR V2 — Importador de salud por terminal.
//
// Carga datos de salud (sueño + métricas de báscula/FC/VFC) directo a Supabase,
// idempotente por id estable (shot:fecha:tipo). Pensado para cuando Aaron pasa
// screenshots por el chat (para no gastar tokens de la app): se leen los valores
// y se vuelcan acá. Mono-usuario (service-role del .env.local).
//
// Uso:  node scripts/import-health.mjs payload.json
//        (o sin arg → usa el EJEMPLO de abajo como plantilla)
//
// payload.json:
// {
//   "userId": "5c23c82c-...",                 // opcional; default: el único user
//   "sleep": { "date":"2026-07-08","bedtime":"00:59","wake_time":"07:09",
//              "durationH":6.15,"score":84,"deep_min":105,"light_min":189,
//              "rem_min":75,"awakenings":1,"notes":"..." },
//   "metrics": [ { "date":"2026-07-08","type":"weight","value":81.8,"unit":"kg",
//                  "captureType":"scale","source":"scale","ts":"07:25" } ]
// }

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const ALLOWED_TYPES = new Set([
  'weight', 'blood_pressure', 'heart_rate', 'steps', 'calories', 'hydration', 'custom',
  'bmi', 'body_fat_percent', 'muscle_mass_kg', 'bone_mass_kg', 'water_percent',
  'protein_percent', 'visceral_fat_level', 'metabolic_rate_kcal',
  'skeletal_muscle_mass_kg', 'metabolic_age', 'body_score', 'ideal_weight_kg',
  'active_energy', 'resting_energy', 'vo2_max', 'blood_oxygen', 'distance_km',
  'heart_rate_min', 'heart_rate_max', 'heart_rate_avg', 'sleeping_heart_rate',
  'hrv_min', 'hrv_max', 'hrv_avg', 'heart_rate_high_alerts', 'respiratory_rate',
])
const ALLOWED_CAPTURE = new Set(['scale', 'whatsapp']) // health_metrics.capture_type
const ALLOWED_SOURCE = new Set(['manual', 'apple_health', 'scale', 'whatsapp'])

function env() {
  return Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
}

async function main() {
  const e = env()
  const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  const path = process.argv[2]
  if (!path) { console.error('Uso: node scripts/import-health.mjs payload.json'); process.exit(1) }
  const payload = JSON.parse(readFileSync(path, 'utf8'))

  let userId = payload.userId
  if (!userId) {
    const { data } = await sb.from('health_metrics').select('user_id').limit(1)
    userId = data?.[0]?.user_id
    if (!userId) { console.error('No pude inferir userId; pasalo en el payload.'); process.exit(1) }
  }

  // Sueño (opcional)
  if (payload.sleep) {
    const s = payload.sleep
    const row = {
      id: `shot:sleep:${s.date}`, user_id: userId, date: s.date,
      bedtime: s.bedtime ?? null, wake_time: s.wake_time ?? null,
      duration: s.durationH ?? null, quality: s.score != null ? Math.round(s.score / 10) : null,
      score: s.score ?? null, deep_min: s.deep_min ?? null, light_min: s.light_min ?? null,
      rem_min: s.rem_min ?? null, awakenings: s.awakenings ?? null, source: 'manual',
      notes: s.notes ?? `Import terminal · score ${s.score ?? '?'}/100`,
    }
    const r = await sb.from('sleep_records').upsert(row, { onConflict: 'id' })
    console.log('sleep', s.date, r.error ? 'FAIL ' + r.error.message : 'ok')
  }

  // Métricas
  const metrics = Array.isArray(payload.metrics) ? payload.metrics : []
  const rows = []
  for (const m of metrics) {
    if (!ALLOWED_TYPES.has(m.type)) { console.warn('  skip type inválido:', m.type); continue }
    const src = m.source && ALLOWED_SOURCE.has(m.source) ? m.source : 'manual'
    const ct = m.captureType && ALLOWED_CAPTURE.has(m.captureType) ? m.captureType : null
    const time = m.ts && /^\d{2}:\d{2}$/.test(m.ts) ? m.ts : '12:00'
    // hora local Lima (UTC-5) → UTC
    const [hh, mm] = time.split(':').map(Number)
    const measuredAt = `${m.date}T${String((hh + 5) % 24).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+00:00`
    const row = { id: `shot:${m.date}:${m.type}`, user_id: userId, type: m.type, value: m.value, unit: m.unit ?? '', note: m.note ?? 'Import terminal', measured_at: measuredAt, source: src }
    if (ct) row.capture_type = ct
    rows.push(row)
  }
  if (rows.length) {
    const r = await sb.from('health_metrics').upsert(rows, { onConflict: 'id' })
    console.log('metrics', r.error ? 'FAIL ' + r.error.message : `ok (${rows.length})`)
  }
  console.log('listo.')
}

main().catch((e) => { console.error(e); process.exit(1) })
