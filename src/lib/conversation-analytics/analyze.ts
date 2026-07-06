// SIR V2 — Capa 0: analítica temporal de conversaciones. PURO, cero API.
//
// Entra el stream de mensajes de una persona ({fromMe, at, text}); sale estadística
// por el tiempo: tendencia de volumen (regresión lineal), cadencia + próximo
// contacto, latencia de respuesta, iniciación/balance, tono (léxico, sin LLM) y
// temas que suben. Honesto: cada sección devuelve null/insufficient si no hay dato
// suficiente. Es la base más barata del motor de predicción y alimenta features de
// las capas superiores.

import { linreg, median } from '@/lib/stats/regression'

export interface ConvMsg {
  /** true = lo mandó Aaron; false = la otra persona. */
  fromMe: boolean
  /** epoch ms del mensaje. */
  at: number
  text: string
}

const DAY = 86_400_000
const WEEK = 7 * DAY
const SESSION_GAP = 6 * 3600_000 // 6 h sin mensajes = nueva "sesión" de conversación

export type Direction = 'creciendo' | 'estable' | 'enfriándose'

export interface ConversationAnalytics {
  total: number
  byMe: number
  byThem: number
  firstAt: number | null
  lastAt: number | null
  spanDays: number
  lastContactDaysAgo: number | null
  volume: {
    weeklyCounts: number[]
    slopePerWeek: number
    r2: number
    direction: Direction
  } | null
  cadence: {
    sessions: number
    medianGapDays: number
    /** epoch ms estimado del próximo contacto (última sesión + gap típico). */
    nextContactAt: number | null
  } | null
  latency: {
    myMedianMinutes: number | null
    theirMedianMinutes: number | null
  } | null
  /** Cuota de mensajes de Aaron (0..1). 0.5 = parejo. */
  myShare: number | null
  /** Cuota de sesiones iniciadas por Aaron (0..1). */
  myInitiationShare: number | null
  tone: {
    /** Índice -1..1 (léxico, aproximado). */
    index: number
    direction: Direction
  } | null
  topics: {
    top: string[]
    rising: string[]
  } | null
  /** Motivos por los que alguna sección quedó en null. */
  insufficient: string[]
}

// ─── Léxico de tono (español, aproximado — NO es análisis de sentimiento fino) ──
const POS = new Set(['gracias', 'genial', 'buenísimo', 'buenisimo', 'perfecto', 'dale', 'listo', 'excelente',
  'bien', 'bueno', 'buena', 'feliz', 'contento', 'contenta', 'amor', 'jaja', 'jajaja', 'lindo', 'linda',
  'grande', 'crack', 'ok', 'okas', 'okey', 'sí', 'si', 'claro', 'obvio', 'placer', 'abrazo', 'éxito'])
const NEG = new Set(['no', 'nunca', 'mal', 'peor', 'problema', 'problemas', 'error', 'triste', 'cansado',
  'cansada', 'molesto', 'molesta', 'enojado', 'enojada', 'perdón', 'perdon', 'disculpa', 'tarde', 'urgente',
  'preocupado', 'preocupada', 'imposible', 'difícil', 'dificil', 'estrés', 'estres', 'lamento', 'nada'])
const POS_EMOJI = /[😀😃😄😁😊🙂😉😍🥰👍🙏✅🎉❤️💪😂🤣]/gu
const NEG_EMOJI = /[😞😟😠😡😢😭😤😨😰😥🙁☹️👎❌⚠️]/gu

const STOP = new Set(['que', 'de', 'la', 'el', 'en', 'y', 'a', 'los', 'las', 'un', 'una', 'por', 'con', 'para',
  'es', 'se', 'no', 'lo', 'del', 'al', 'su', 'sus', 'me', 'te', 'le', 'les', 'mi', 'tu', 'más', 'mas', 'ya',
  'si', 'sí', 'pero', 'como', 'esto', 'eso', 'esa', 'ese', 'está', 'esta', 'estan', 'están', 'hay', 'muy',
  'ok', 'okas', 'dale', 'hola', 'jaja', 'jajaja', 'gracias', 'porfa', 'oka', 'bien', 'creo', 'ver', 'hacer'])

function deburr(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
function tokens(s: string): string[] {
  return deburr(s).split(/[^a-z0-9áéíóúñ]+/i).filter((t) => t.length >= 4 && !STOP.has(t))
}

function toneOf(text: string): number {
  const words = deburr(text).split(/[^a-záéíóúñ]+/i).filter(Boolean)
  if (!words.length) return 0
  let pos = 0, neg = 0
  for (const w of words) { if (POS.has(w)) pos++; else if (NEG.has(w)) neg++ }
  pos += (text.match(POS_EMOJI) || []).length
  neg += (text.match(NEG_EMOJI) || []).length
  const exclam = (text.match(/!/g) || []).length
  const raw = (pos - neg + exclam * 0.2) / Math.sqrt(words.length)
  return Math.max(-1, Math.min(1, raw))
}

function directionOf(slope: number, scale: number): Direction {
  const t = 0.08 * scale
  if (slope > t) return 'creciendo'
  if (slope < -t) return 'enfriándose'
  return 'estable'
}

export function analyzeConversation(messages: ConvMsg[], now: number): ConversationAnalytics {
  const insufficient: string[] = []
  const msgs = messages.filter((m) => Number.isFinite(m.at) && m.text.trim().length > 0).sort((a, b) => a.at - b.at)
  const total = msgs.length
  const byMe = msgs.filter((m) => m.fromMe).length
  const byThem = total - byMe
  const firstAt = total ? msgs[0].at : null
  const lastAt = total ? msgs[total - 1].at : null
  const spanDays = firstAt && lastAt ? Math.max(0, (lastAt - firstAt) / DAY) : 0
  const lastContactDaysAgo = lastAt != null ? Math.max(0, (now - lastAt) / DAY) : null

  const base: ConversationAnalytics = {
    total, byMe, byThem, firstAt, lastAt, spanDays: Math.round(spanDays * 10) / 10, lastContactDaysAgo,
    volume: null, cadence: null, latency: null, myShare: null, myInitiationShare: null, tone: null, topics: null, insufficient,
  }
  if (total < 6) { insufficient.push('pocos mensajes (<6)'); return base }

  base.myShare = Math.round((byMe / total) * 100) / 100

  // ── Volumen por semana + tendencia ──
  if (firstAt != null && spanDays >= 10) {
    const weeks = Math.max(1, Math.ceil((lastAt! - firstAt) / WEEK))
    const counts = new Array(weeks).fill(0)
    for (const m of msgs) counts[Math.min(weeks - 1, Math.floor((m.at - firstAt) / WEEK))]++
    const reg = linreg(counts.map((_, i) => i), counts)
    if (reg) {
      const mean = total / weeks
      base.volume = {
        weeklyCounts: counts,
        slopePerWeek: Math.round(reg.slope * 100) / 100,
        r2: Math.round(reg.r2 * 100) / 100,
        direction: directionOf(reg.slope, Math.max(1, mean)),
      }
    }
  } else insufficient.push('serie corta (<10 días) para tendencia de volumen')

  // ── Sesiones: cadencia, iniciación, próximo contacto ──
  const sessionStarts: ConvMsg[] = []
  const gaps: number[] = []
  let prev: number | null = null
  for (const m of msgs) {
    if (prev == null || m.at - prev > SESSION_GAP) {
      if (prev != null) gaps.push(m.at - sessionStarts[sessionStarts.length - 1].at)
      sessionStarts.push(m)
    }
    prev = m.at
  }
  // gaps entre inicios de sesión
  const startGaps: number[] = []
  for (let i = 1; i < sessionStarts.length; i++) startGaps.push(sessionStarts[i].at - sessionStarts[i - 1].at)
  if (sessionStarts.length >= 2) {
    const medGap = median(startGaps)!
    base.cadence = {
      sessions: sessionStarts.length,
      medianGapDays: Math.round((medGap / DAY) * 10) / 10,
      nextContactAt: lastAt != null ? lastAt + medGap : null,
    }
    base.myInitiationShare = Math.round((sessionStarts.filter((s) => s.fromMe).length / sessionStarts.length) * 100) / 100
  } else insufficient.push('una sola sesión (sin cadencia)')

  // ── Latencia de respuesta (dentro de sesión, en cambios de autor) ──
  const myLat: number[] = [], theirLat: number[] = []
  for (let i = 1; i < msgs.length; i++) {
    const a = msgs[i - 1], b = msgs[i]
    if (b.at - a.at > SESSION_GAP) continue
    if (a.fromMe !== b.fromMe) {
      const gapMin = (b.at - a.at) / 60000
      if (b.fromMe) myLat.push(gapMin); else theirLat.push(gapMin)
    }
  }
  if (myLat.length || theirLat.length) {
    const mm = median(myLat), tm = median(theirLat)
    base.latency = {
      myMedianMinutes: mm != null ? Math.round(mm) : null,
      theirMedianMinutes: tm != null ? Math.round(tm) : null,
    }
  }

  // ── Tono (léxico) + tendencia ──
  const toneVals = msgs.map((m) => ({ at: m.at, t: toneOf(m.text) }))
  const toneMean = toneVals.reduce((s, v) => s + v.t, 0) / toneVals.length
  if (firstAt != null && spanDays >= 10) {
    const weeks = Math.max(1, Math.ceil((lastAt! - firstAt) / WEEK))
    const sums = new Array(weeks).fill(0), ns = new Array(weeks).fill(0)
    for (const v of toneVals) { const w = Math.min(weeks - 1, Math.floor((v.at - firstAt) / WEEK)); sums[w] += v.t; ns[w]++ }
    const xs: number[] = [], ys: number[] = []
    for (let i = 0; i < weeks; i++) if (ns[i]) { xs.push(i); ys.push(sums[i] / ns[i]) }
    const reg = linreg(xs, ys)
    base.tone = { index: Math.round(toneMean * 100) / 100, direction: reg ? directionOf(reg.slope, 1) : 'estable' }
  } else {
    base.tone = { index: Math.round(toneMean * 100) / 100, direction: 'estable' }
  }

  // ── Temas: top general + los que suben (último tercio vs resto) ──
  const cut = firstAt != null ? firstAt + (lastAt! - firstAt) * (2 / 3) : now
  const freqAll = new Map<string, number>(), freqRecent = new Map<string, number>(), freqOld = new Map<string, number>()
  for (const m of msgs) {
    for (const tk of tokens(m.text)) {
      freqAll.set(tk, (freqAll.get(tk) || 0) + 1)
      if (m.at >= cut) freqRecent.set(tk, (freqRecent.get(tk) || 0) + 1)
      else freqOld.set(tk, (freqOld.get(tk) || 0) + 1)
    }
  }
  if (freqAll.size) {
    const top = [...freqAll.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t)
    const rising = [...freqRecent.entries()]
      .filter(([t, n]) => n >= 2 && n > (freqOld.get(t) || 0))
      .sort((a, b) => (b[1] - (freqOld.get(b[0]) || 0)) - (a[1] - (freqOld.get(a[0]) || 0)))
      .slice(0, 5).map(([t]) => t)
    base.topics = { top, rising }
  }

  return base
}
