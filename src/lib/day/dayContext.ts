// SIR V2 — Motor "¿qué pasó el día X?". Núcleo PURO: detectar la fecha en la
// pregunta + renderizar el contexto cruzado de ese día para el grounding del
// chat. El fetch server (fetch.ts) arma los slices; acá solo lógica pura.

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, setiembre: 9, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

function pad2(n: number): string { return String(n).padStart(2, '0') }
function ymd(y: number, m: number, d: number): string { return `${y}-${pad2(m)}-${pad2(d)}` }

function shiftDays(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + delta)
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

/**
 * Detecta una referencia de FECHA en la pregunta y la resuelve a 'YYYY-MM-DD'
 * (día calendario de Lima). `today` = día de hoy en Lima. Devuelve null si la
 * pregunta no apunta a un día concreto. PURO.
 *
 * Soporta: hoy/ayer/anteayer/antier · YYYY-MM-DD · D/M[/Y] · "D de <mes>" ·
 * "el D"/"día D" (asume mes/año actual; si el día es futuro respecto de hoy,
 * cae al mes anterior).
 */
export function extractDayRef(question: string, today: string): string | null {
  const q = ' ' + question.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + ' '
  const [ty, tm, td] = today.split('-').map(Number)

  if (/\banteayer\b|\bantier\b/.test(q)) return shiftDays(today, -2)
  if (/\bayer\b/.test(q)) return shiftDays(today, -1)
  if (/\bhoy\b/.test(q)) return today

  // ISO explícito YYYY-MM-DD
  const iso = q.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  if (iso) return ymd(+iso[1], +iso[2], +iso[3])

  // D/M/Y o D-M-Y (con año)
  const dmy = q.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/)
  if (dmy) {
    let y = +dmy[3]; if (y < 100) y += 2000
    return ymd(y, +dmy[2], +dmy[1])
  }
  // D/M (sin año) → año actual
  const dm = q.match(/\b(\d{1,2})[/.](\d{1,2})\b/)
  if (dm) return ymd(ty, +dm[2], +dm[1])

  // "D de <mes>" (con año opcional)
  const dDeMes = q.match(/\b(\d{1,2})\s+de\s+([a-z]+)(?:\s+(?:de\s+)?(\d{4}))?/)
  if (dDeMes && MONTHS[dDeMes[2]]) {
    const y = dDeMes[3] ? +dDeMes[3] : ty
    return ymd(y, MONTHS[dDeMes[2]], +dDeMes[1])
  }

  // "el D" / "dia D" (solo número de día) → mes/año actual; si es futuro, mes anterior
  const elD = q.match(/\b(?:el|dia)\s+(\d{1,2})\b/)
  if (elD) {
    const day = +elD[1]
    if (day < 1 || day > 31) return null
    let y = ty, m = tm
    if (day > td) { m -= 1; if (m < 1) { m = 12; y -= 1 } }
    return ymd(y, m, day)
  }
  return null
}

// ─── Render del contexto del día ───────────────────────────────────

export interface DayInteraction { person: string; quality: number | null; note: string | null }
export interface DayObservation { person: string; summary: string }
export interface DayDeal { title: string; what: string }      // creado/actualizado/próximo paso
export interface DayStep { goal: string; step: string }        // paso OKR completado
export interface DayMetric { label: string; value: string }    // salud/score
export interface DayScoreMove { person: string; global: number; delta: number | null }

export interface DaySlices {
  date: string
  moonLabel: string | null
  interactions: DayInteraction[]
  observations: DayObservation[]
  deals: DayDeal[]
  steps: DayStep[]
  health: DayMetric[]
  scoreMoves: DayScoreMove[]
}

const QUAL = ['', 'muy tensa', 'tensa', 'neutral', 'cálida', 'plena']

/** Texto legible del día para inyectar como grounding. Vacío estructurado si
 *  no hubo nada (para que el modelo diga "no hay registro de ese día"). PURO. */
export function renderDayContext(s: DaySlices): string {
  const L: string[] = [`CONTEXTO DEL DÍA ${s.date}${s.moonLabel ? ` · luna: ${s.moonLabel}` : ''}:`]
  let any = false
  if (s.interactions.length) {
    any = true
    L.push('Interacciones:')
    for (const i of s.interactions) {
      const q = i.quality != null ? ` (${QUAL[i.quality] ?? i.quality})` : ''
      L.push(`  - ${i.person}${q}${i.note ? `: ${i.note}` : ''}`)
    }
  }
  if (s.observations.length) {
    any = true
    L.push('Conversaciones/capturas:')
    for (const o of s.observations) L.push(`  - ${o.person}: ${o.summary}`)
  }
  if (s.deals.length) {
    any = true
    L.push('Oportunidades:')
    for (const d of s.deals) L.push(`  - ${d.title} — ${d.what}`)
  }
  if (s.steps.length) {
    any = true
    L.push('Objetivos (pasos completados):')
    for (const st of s.steps) L.push(`  - ${st.goal}: ${st.step}`)
  }
  if (s.health.length) {
    any = true
    L.push('Salud:')
    for (const h of s.health) L.push(`  - ${h.label}: ${h.value}`)
  }
  if (s.scoreMoves.length) {
    any = true
    L.push('Vínculos (score ese día):')
    for (const m of s.scoreMoves) {
      const d = m.delta != null && m.delta !== 0 ? ` (${m.delta > 0 ? '+' : ''}${m.delta} vs día previo)` : ''
      L.push(`  - ${m.person}: ${m.global}/100${d}`)
    }
  }
  if (!any) L.push('(Sin registros ese día.)')
  return L.join('\n')
}

/** Ventana UTC [inicio, fin) que corresponde a un día calendario de Lima
 *  (UTC-5): el día D de Lima va de D 05:00Z a (D+1) 05:00Z. */
export function limaDayUtcWindow(date: string): { startUtc: string; endUtc: string } {
  return { startUtc: `${date}T05:00:00.000Z`, endUtc: `${shiftDays(date, 1)}T05:00:00.000Z` }
}
