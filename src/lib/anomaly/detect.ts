// SIR V2 — "Cosas que no te cuadran" (AF·F3, cluster auto-forense).
//
// Detecta ANOMALÍAS en TU propia data: un gasto muy fuera de lo habitual, una
// noche de sueño rarísima, una lectura de ánimo/estrés que se dispara. Es
// auto-forense (Pathfinder sano): mirar TU vida para verte, no vigilar a nadie.
// Honesto: marca lo que se SALE de tu patrón como "mira si tiene sentido" — no
// es alarma ni veredicto, y correlación ≠ causa.
//
// PURO y determinístico. Usa mediana + MAD (desvío absoluto mediano) → robusto a
// los propios outliers (mejor que promedio/desvío estándar).

export type AnomalySource = 'finanzas' | 'sueno' | 'animo' | 'salud'
export type AnomalySeverity = 'alta' | 'media'

export interface Anomaly {
  id: string
  source: AnomalySource
  severity: AnomalySeverity
  title: string
  detail: string
  date: string
}

const DAY_MS = 86_400_000
const RECENT_DAYS = 60      // solo anomalías recientes (accionables)
const Z_FLAG = 3.5          // umbral de outlier (z robusto)
const Z_HIGH = 5           // por encima → severidad alta
const MIN_SAMPLE = 6        // mínimo de datos para tener un patrón
const MAX_ANOMALIES = 8

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function mad(xs: number[], med: number): number {
  return median(xs.map((x) => Math.abs(x - med)))
}
function meanAD(xs: number[], med: number): number {
  return xs.length ? xs.reduce((s, x) => s + Math.abs(x - med), 0) / xs.length : 0
}
/** Estimador robusto del desvío estándar. Usa MAD (÷0.6745); si MAD=0 (muchos
 *  valores idénticos, ej. gasto regular + 1 spike) cae al desvío absoluto medio
 *  (÷0.7979). 0 solo si NO hay dispersión alguna (todo idéntico). */
function dispersion(xs: number[], med: number): number {
  const madv = mad(xs, med)
  if (madv > 0) return madv / 0.6745
  const m2 = meanAD(xs, med)
  return m2 > 0 ? m2 / 0.7979 : 0
}
function zScore(x: number, med: number, disp: number): number {
  return disp > 0 ? (x - med) / disp : 0
}

function daysAgo(dateKey: string, nowMs: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateKey ?? '')
  if (!m) return Infinity
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return Number.isFinite(t) ? Math.round((nowMs - t) / DAY_MS) : Infinity
}
function dayOf(date: string): string {
  if (date.includes('T')) { const d = date.slice(0, 10); return d }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(date ?? ''); return m ? m[1] : ''
}
const CAT_LABEL: Record<string, string> = { energy: 'Energía', mood: 'Ánimo', stress: 'Estrés', focus: 'Enfoque', motivation: 'Motivación', confidence: 'Confianza' }

export interface AnomalyInput {
  finance: { id: string; amountPEN: number; date: string; type: string; description?: string }[]
  metrics: { id: string; category: string; value: number; timestamp: string }[]
  sleep: { id: string; duration: number; date: string }[]
}

export function detectAnomalies(input: AnomalyInput, nowMs: number): Anomaly[] {
  const out: Anomaly[] = []

  // ── Finanzas: gastos atípicamente altos vs tu gasto habitual ──────────
  const expenses = input.finance.filter((f) => (f.type === 'expense' || f.type === 'debt') && Number.isFinite(f.amountPEN) && f.amountPEN > 0)
  if (expenses.length >= MIN_SAMPLE) {
    const amts = expenses.map((e) => e.amountPEN)
    const med = median(amts); const disp = dispersion(amts, med)
    for (const e of expenses) {
      const day = dayOf(e.date)
      if (daysAgo(day, nowMs) > RECENT_DAYS) continue
      const z = zScore(e.amountPEN, med, disp)
      if (z > Z_FLAG) {
        const mult = med > 0 ? Math.round(e.amountPEN / med) : 0
        out.push({
          id: `f_${e.id}`, source: 'finanzas', severity: z > Z_HIGH ? 'alta' : 'media', date: day,
          title: `Gasto atípico: S/ ${Math.round(e.amountPEN).toLocaleString('es')}`,
          detail: `${e.description ? e.description + ' — ' : ''}~${mult}× tu gasto habitual (mediana S/ ${Math.round(med).toLocaleString('es')}). ¿Tiene sentido?`,
        })
      }
    }
  }

  // ── Ánimo / métricas: lecturas que se disparan vs tu promedio ─────────
  const byCat = new Map<string, typeof input.metrics>()
  for (const mt of input.metrics) {
    if (!Number.isFinite(mt.value)) continue
    if (!byCat.has(mt.category)) byCat.set(mt.category, [])
    byCat.get(mt.category)!.push(mt)
  }
  for (const [cat, rows] of byCat) {
    if (rows.length < MIN_SAMPLE) continue
    const vals = rows.map((r) => r.value)
    const med = median(vals); const disp = dispersion(vals, med)
    for (const r of rows) {
      const day = dayOf(r.timestamp)
      if (daysAgo(day, nowMs) > RECENT_DAYS) continue
      const z = zScore(r.value, med, disp)
      if (Math.abs(z) > Z_FLAG) {
        const dir = z > 0 ? 'por encima' : 'por debajo'
        out.push({
          id: `m_${r.id}`, source: 'animo', severity: Math.abs(z) > Z_HIGH ? 'alta' : 'media', date: day,
          title: `${CAT_LABEL[cat] ?? cat} ${r.value}/10 — fuera de tu patrón`,
          detail: `Muy ${dir} de tu promedio (${med}/10). Contexto, no diagnóstico.`,
        })
      }
    }
  }

  // ── Sueño: noches muy fuera de tu ritmo ───────────────────────────────
  const sleeps = input.sleep.filter((s) => Number.isFinite(s.duration) && s.duration > 0)
  if (sleeps.length >= MIN_SAMPLE) {
    const durs = sleeps.map((s) => s.duration)
    const med = median(durs); const disp = dispersion(durs, med)
    for (const s of sleeps) {
      const day = dayOf(s.date)
      if (daysAgo(day, nowMs) > RECENT_DAYS) continue
      const z = zScore(s.duration, med, disp)
      if (Math.abs(z) > Z_FLAG) {
        out.push({
          id: `sl_${s.id}`, source: 'sueno', severity: Math.abs(z) > Z_HIGH ? 'alta' : 'media', date: day,
          title: `Dormiste ${s.duration}h — fuera de tu ritmo`,
          detail: `Tu ritmo habitual ronda las ${med}h. ${z < 0 ? 'Una noche corta suelta no es deuda; si se repite, ojo.' : ''}`.trim(),
        })
      }
    }
  }

  // Más recientes primero, luego severidad; cap.
  const sevRank: Record<AnomalySeverity, number> = { alta: 0, media: 1 }
  return out
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : sevRank[a.severity] - sevRank[b.severity]))
    .slice(0, MAX_ANOMALIES)
}
