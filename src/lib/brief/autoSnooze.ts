// SIR V2 — El brief se calla solo lo que ya dijo. PURO.
//
// POR QUÉ: el brief se recalcula desde cero cada mañana. Mientras la condición
// siga siendo verdad, repite la misma línea para siempre — y eso entrena a
// ignorarlo. Aaron (2026-07-25): «ya sabemos que mi mamá está empinchada por el
// tema del Mundial, que me lo recuerdes todos los días no me ayuda en nada».
//
// REGLA: una señal que apareció MAX_STREAK mañanas SEGUIDAS sin cambiar de tema
// se duerme, y vuelve recién SNOOZE_DAYS después (si para entonces sigue
// vigente). Ni la repite a diario, ni la olvida para siempre.
//
// El "sin cambiar" se juzga por `topicKey` (hash estable del tema, no del
// texto): "hace 3 semanas sin hablar" y "hace 7 semanas sin hablar" son LA MISMA
// señal, no una nueva. Si de verdad cambia (tu mamá te escribió), el topicKey es
// otro y aparece como novedad.
//
// El 🔕 manual (0166) es distinto y más fuerte: calla para siempre hasta que
// Aaron lo revierta. Esto es el piloto automático.

import { topicKey, type MorningSignal } from '@/lib/push/morning'

/** Mañanas seguidas que una señal puede aparecer antes de dormirse. */
export const MAX_STREAK = 3
/** Días que duerme antes de volver a asomar. */
export const SNOOZE_DAYS = 14

/** Estado por señal, tal como vive en `brief_sent_signals` (0166 + 0168). */
export interface BriefSignalHistory {
  ref: string
  topicKey: string
  /** Mañanas consecutivas que se mostró. */
  streakDays: number
  /** Día de Lima (YYYY-MM-DD) de la última vez que se mostró. */
  lastSentDay: string | null
  /** Día en que se durmió sola. null = despierta. */
  autoSnoozedAt: string | null
}

export interface SilencedSignal {
  ref: string
  topicKey: string
  text: string
  reason: 'racha' | 'durmiendo'
}

export interface AutoSnoozeResult {
  /** Las que SÍ se muestran hoy. */
  visible: MorningSignal[]
  /** Las que no, con el porqué (para log/telemetría). */
  silenced: SilencedSignal[]
  /** Estado a persistir: una fila por señal EVALUADA (visible o dormida hoy). */
  updates: BriefSignalHistory[]
}

/** YYYY-MM-DD del día anterior. PURA. */
export function previousDay(dayKey: string): string {
  const t = Date.parse(`${dayKey}T12:00:00Z`)
  if (!Number.isFinite(t)) return ''
  return new Date(t - 86_400_000).toISOString().slice(0, 10)
}

/** Días enteros entre dos YYYY-MM-DD (b - a). NaN si alguno es inválido. PURA. */
export function daysBetweenKeys(a: string, b: string): number {
  const ta = Date.parse(`${a}T12:00:00Z`)
  const tb = Date.parse(`${b}T12:00:00Z`)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return NaN
  return Math.round((tb - ta) / 86_400_000)
}

/**
 * Decide qué señales se muestran hoy y cuáles se callan solas.
 *
 * @param signals   las del brief de hoy, ya deduplicadas
 * @param history   estado previo por `ref` (de brief_sent_signals)
 * @param todayKey  día de Lima YYYY-MM-DD
 * @param refOf     cómo obtener la ref corta de una señal (muteRef del hilo)
 */
export function applyAutoSnooze(
  signals: MorningSignal[],
  history: BriefSignalHistory[],
  todayKey: string,
  refOf: (text: string) => string,
  opts: { maxStreak?: number; snoozeDays?: number } = {},
): AutoSnoozeResult {
  const maxStreak = opts.maxStreak ?? MAX_STREAK
  const snoozeDays = opts.snoozeDays ?? SNOOZE_DAYS
  const byRef = new Map(history.map((h) => [h.ref, h]))
  const yesterday = previousDay(todayKey)

  const visible: MorningSignal[] = []
  const silenced: SilencedSignal[] = []
  const updates: BriefSignalHistory[] = []

  for (const s of signals) {
    const ref = refOf(s.text)
    const key = topicKey(s.text)
    const h = byRef.get(ref)

    // ¿Sigue durmiendo? Se despierta cuando pasaron snoozeDays.
    if (h?.autoSnoozedAt) {
      const slept = daysBetweenKeys(h.autoSnoozedAt, todayKey)
      if (Number.isFinite(slept) && slept < snoozeDays) {
        silenced.push({ ref, topicKey: key, text: s.text, reason: 'durmiendo' })
        continue
      }
      // Despertó: vuelve a asomar y arranca racha nueva.
      visible.push(s)
      updates.push({ ref, topicKey: key, streakDays: 1, lastSentDay: todayKey, autoSnoozedAt: null })
      continue
    }

    // Re-corrida del mismo día (el cron reintentó): ni suma racha ni cambia nada.
    if (h?.lastSentDay === todayKey) {
      visible.push(s)
      updates.push({ ref, topicKey: key, streakDays: h.streakDays, lastSentDay: todayKey, autoSnoozedAt: null })
      continue
    }

    // Racha: +1 si ayer también salió; si hubo un hueco, vuelve a empezar.
    const streak = h && h.lastSentDay === yesterday ? h.streakDays + 1 : 1
    if (streak > maxStreak) {
      silenced.push({ ref, topicKey: key, text: s.text, reason: 'racha' })
      updates.push({ ref, topicKey: key, streakDays: streak, lastSentDay: h?.lastSentDay ?? null, autoSnoozedAt: todayKey })
      continue
    }
    visible.push(s)
    updates.push({ ref, topicKey: key, streakDays: streak, lastSentDay: todayKey, autoSnoozedAt: null })
  }

  return { visible, silenced, updates }
}
