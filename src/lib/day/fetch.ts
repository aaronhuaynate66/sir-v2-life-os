// SIR V2 — Motor "¿qué pasó el día X?": fetch SERVER que cruza todas las tablas
// por el día calendario de Lima y arma DaySlices. Best-effort por fuente (si una
// query falla, las demás siguen). RLS + user_id explícito.

import type { SupabaseClient } from '@supabase/supabase-js'
import { moonPhase } from '@/lib/lunar/phase'
import { HEALTH_METRIC_LABELS } from '@/lib/health-metrics/labels'
import type { HealthMetricType } from '@/types'
import { limaDayUtcWindow, type DaySlices } from './dayContext'
import { fetchWeather } from './weather'

const SELF_LABEL: Record<string, string> = {
  energy: 'Energía', mood: 'Ánimo', sleep: 'Sueño', pain: 'Dolor', stress: 'Estrés',
}

export async function fetchDayContext(
  supabase: SupabaseClient,
  userId: string,
  date: string,
): Promise<DaySlices> {
  const { startUtc, endUtc } = limaDayUtcWindow(date)
  const slices: DaySlices = {
    date, moonLabel: null, interactions: [], observations: [], deals: [], steps: [], health: [], scoreMoves: [], finances: [], signals: [], weather: null, meds: [], moments: [],
  }
  try { slices.moonLabel = moonPhase(new Date(`${date}T12:00:00.000Z`)).label } catch { /* */ }

  // Mapas de nombres (personas, objetivos).
  const nameById = new Map<string, string>()
  const goalById = new Map<string, string>()
  try {
    const { data } = await supabase.from('people').select('id, name').eq('user_id', userId).limit(2000)
    for (const p of (data ?? []) as Array<{ id: string; name: string }>) nameById.set(p.id, p.name)
  } catch { /* */ }
  try {
    const { data } = await supabase.from('goals').select('id, title').eq('user_id', userId).limit(500)
    for (const g of (data ?? []) as Array<{ id: string; title: string }>) goalById.set(g.id, g.title)
  } catch { /* */ }
  const pn = (id: string | null) => (id && nameById.get(id)) || 'alguien'

  // 1. Interacciones (person_logs).
  try {
    const { data } = await supabase.from('person_logs')
      .select('person_id, value, note, logged_at, kind')
      .eq('user_id', userId).eq('kind', 'interaction')
      .gte('logged_at', startUtc).lt('logged_at', endUtc).limit(50)
    for (const r of (data ?? []) as Array<{ person_id: string; value: number; note: string | null }>) {
      slices.interactions.push({ person: pn(r.person_id), quality: typeof r.value === 'number' ? r.value : null, note: r.note ?? null })
    }
  } catch { /* */ }

  // 2. Conversaciones/capturas (observations).
  try {
    const { data } = await supabase.from('observations')
      .select('person_id, capture_type, data, observed_at, is_obsolete')
      .eq('user_id', userId).eq('is_obsolete', false)
      .gte('observed_at', startUtc).lt('observed_at', endUtc).limit(50)
    for (const r of (data ?? []) as Array<{ person_id: string | null; data: Record<string, unknown> | null; capture_type: string }>) {
      const sum = typeof r.data?.summary === 'string' ? (r.data!.summary as string) : `captura ${r.capture_type}`
      slices.observations.push({ person: pn(r.person_id), summary: sum.slice(0, 200) })
    }
  } catch { /* */ }

  // 3. Oportunidades (deals): actualizadas ese día o con próximo paso ese día.
  try {
    const { data } = await supabase.from('deals')
      .select('title, stage, next_action, next_action_date, updated_at')
      .eq('user_id', userId)
      .or(`and(updated_at.gte.${startUtc},updated_at.lt.${endUtc}),next_action_date.eq.${date}`)
      .limit(30)
    for (const r of (data ?? []) as Array<{ title: string; stage: string; next_action: string | null; next_action_date: string | null }>) {
      const what = r.next_action_date === date && r.next_action ? `próximo paso: ${r.next_action}` : `etapa ${r.stage} (actividad)`
      slices.deals.push({ title: r.title, what })
    }
  } catch { /* */ }

  // 4. Pasos de objetivos completados ese día.
  try {
    const { data } = await supabase.from('objective_steps')
      .select('title, objective_id, completed_at')
      .eq('user_id', userId)
      .gte('completed_at', startUtc).lt('completed_at', endUtc).limit(50)
    for (const r of (data ?? []) as Array<{ title: string; objective_id: string }>) {
      slices.steps.push({ goal: goalById.get(r.objective_id) ?? 'objetivo', step: r.title })
    }
  } catch { /* */ }

  // 5. Salud: self_metrics + health_metrics (timestamp) + sleep_records (date).
  try {
    const { data } = await supabase.from('self_metrics')
      .select('category, value, timestamp')
      .eq('user_id', userId).gte('timestamp', startUtc).lt('timestamp', endUtc).limit(50)
    for (const r of (data ?? []) as Array<{ category: string; value: number }>) {
      slices.health.push({ label: SELF_LABEL[r.category] ?? r.category, value: `${r.value}/10` })
    }
  } catch { /* */ }
  try {
    const { data } = await supabase.from('health_metrics')
      .select('type, value, unit, timestamp')
      .eq('user_id', userId).gte('timestamp', startUtc).lt('timestamp', endUtc).limit(60)
    for (const r of (data ?? []) as Array<{ type: string; value: number; unit: string | null }>) {
      const label = HEALTH_METRIC_LABELS[r.type as HealthMetricType] ?? r.type
      slices.health.push({ label, value: `${r.value}${r.unit ? ' ' + r.unit : ''}` })
    }
  } catch { /* */ }
  try {
    const { data } = await supabase.from('sleep_records')
      .select('date, duration, quality').eq('user_id', userId).eq('date', date).limit(3)
    for (const r of (data ?? []) as Array<{ duration: number; quality: number }>) {
      slices.health.push({ label: 'Sueño', value: `${r.duration}h · calidad ${r.quality}/10` })
    }
  } catch { /* */ }

  // 6. Score relacional ese día + delta vs día previo (person_score_snapshots).
  try {
    const prev = limaDayUtcWindow(date) // solo para reusar shiftDays vía date string
    void prev
    const prevDate = (() => { const [y, m, d] = date.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() - 1); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}` })()
    const { data } = await supabase.from('person_score_snapshots')
      .select('person_id, global, date_bucket')
      .eq('user_id', userId).in('date_bucket', [date, prevDate]).limit(400)
    const today = new Map<string, number>(), yest = new Map<string, number>()
    for (const r of (data ?? []) as Array<{ person_id: string; global: number; date_bucket: string }>) {
      if (r.date_bucket === date) today.set(r.person_id, r.global)
      else yest.set(r.person_id, r.global)
    }
    for (const [pid, g] of today) {
      const y = yest.get(pid)
      slices.scoreMoves.push({ person: pn(pid), global: g, delta: typeof y === 'number' ? g - y : null })
    }
    // Priorizar los que se movieron; cap 12.
    slices.scoreMoves.sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
    slices.scoreMoves = slices.scoreMoves.slice(0, 12)
  } catch { /* */ }

  // 7. Finanzas (finance_movements) de ese día.
  try {
    const { data } = await supabase.from('finance_movements')
      .select('type, amount, currency, description, date')
      .eq('user_id', userId).eq('date', date).limit(40)
    for (const r of (data ?? []) as Array<{ type: string; amount: number; currency: string; description: string }>) {
      slices.finances.push({ type: r.type, amount: Number(r.amount) || 0, currency: r.currency || 'PEN', description: (r.description || '').slice(0, 120) })
    }
  } catch { /* */ }

  // 8. Señales detectadas ese día (signals).
  try {
    const { data } = await supabase.from('signals')
      .select('content, urgency, detected_at, resolved')
      .eq('user_id', userId)
      .gte('detected_at', startUtc).lt('detected_at', endUtc).limit(30)
    for (const r of (data ?? []) as Array<{ content: string; urgency: string }>) {
      slices.signals.push({ content: (r.content || '').slice(0, 160), urgency: r.urgency || 'monitor' })
    }
  } catch { /* */ }

  // 8b. Medicación tomada ese día (med_intakes).
  try {
    const { data } = await supabase.from('med_intakes')
      .select('name, quantity, taken_at')
      .eq('user_id', userId).gte('taken_at', startUtc).lt('taken_at', endUtc).limit(30)
    for (const r of (data ?? []) as Array<{ name: string; quantity: number; taken_at: string }>) {
      const hh = new Date(r.taken_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })
      slices.meds.push({ name: r.name, quantity: Number(r.quantity) || 1, time: hh })
    }
  } catch { /* */ }

  // 8c. Momentos/decisiones ABIERTOS que ocurrieron ese día o tienen seguimiento ese día.
  try {
    const { data } = await supabase.from('relationship_moments')
      .select('person_id, title, occurred_on, follow_up_on, status')
      .eq('user_id', userId).eq('status', 'abierto').limit(100)
    for (const r of (data ?? []) as Array<{ person_id: string; title: string; occurred_on: string; follow_up_on: string | null }>) {
      const occ = (r.occurred_on || '').slice(0, 10)
      const fol = (r.follow_up_on || '').slice(0, 10)
      if (fol === date) slices.moments.push({ person: pn(r.person_id), title: (r.title || '').slice(0, 160), kind: 'follow' })
      else if (occ === date) slices.moments.push({ person: pn(r.person_id), title: (r.title || '').slice(0, 160), kind: 'occurred' })
    }
  } catch { /* */ }

  // 9. Señal externa: clima del día (Open-Meteo, Lima). Best-effort.
  try { const w = await fetchWeather(date); if (w) slices.weather = w.label } catch { /* */ }

  return slices
}
