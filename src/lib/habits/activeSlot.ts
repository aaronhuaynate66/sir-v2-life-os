// SIR V2 — Hábitos 12·M1: prompt atado a la franja (Fogg: el Prompt).
//
// Cuando una tarea con `dueTime` vence HOY, /horario ya la ubica en su franja.
// Este motor suma el RECORDATORIO ACTIVO: cuando el reloj entra en esa franja,
// devuelve "Ahora: <paso> · esfuerzo S" — ata la acción a una señal temporal
// concreta (el pilar de Fogg). Confianza alta, sin motor pesado. PURO: quien
// llama pasa `nowMs`; la conversión a reloj Lima vive acá.

import { msToLimaHHMM } from '@/lib/horario/limaClock'
import { todayLimaKey } from '@/lib/dates/limaDay'
import { hhmmToMinutes } from './timeContext'

export interface SlotTask {
  id: string
  title: string
  /** 'HH:MM' (reloj Lima). */
  dueTime?: string
  /** 'YYYY-MM-DD'. */
  targetDate?: string
  /** Camiseta S/M/L (opcional). */
  effort?: string
  /** ¿Ya está hecha? (status efectivo resuelto por quien llama). */
  done: boolean
}

export interface ActiveSlotPrompt {
  taskId: string
  title: string
  effort?: string
  /** true = todavía no empezó (arranca pronto); false = ya estás dentro. */
  imminent: boolean
  /** Minutos hasta el inicio (>0 imminent) o desde el inicio (<=0). */
  deltaMin: number
  dueTime: string
  text: string
}

/** Aparece hasta LEAD_MIN antes del inicio y sigue activo WINDOW_MIN después. */
const LEAD_MIN = 10
const WINDOW_MIN = 60

/**
 * Devuelve el prompt de la tarea cuya franja está activa AHORA (o arranca en
 * breve), o null. Si hay varias, elige la más cercana al momento. PURO.
 */
export function activeSlotPrompt(tasks: SlotTask[], nowMs: number): ActiveSlotPrompt | null {
  const today = todayLimaKey(nowMs)
  const nowMin = hhmmToMinutes(msToLimaHHMM(nowMs))
  if (nowMin == null) return null

  let best: ActiveSlotPrompt | null = null
  for (const t of tasks) {
    if (t.done) continue
    if (!t.targetDate || t.targetDate.slice(0, 10) !== today) continue
    const due = hhmmToMinutes(t.dueTime)
    if (due == null) continue
    const delta = due - nowMin // >0 = arranca en `delta` min; <=0 = arrancó hace |delta|
    if (delta > LEAD_MIN || delta < -WINDOW_MIN) continue

    const imminent = delta > 0
    const effortSuffix = t.effort ? ` · esfuerzo ${t.effort}` : ''
    const text = imminent
      ? `En breve (${t.dueTime}): ${t.title}${effortSuffix}`
      : `Ahora: ${t.title}${effortSuffix}`
    const candidate: ActiveSlotPrompt = {
      taskId: t.id,
      title: t.title,
      effort: t.effort,
      imminent,
      deltaMin: delta,
      dueTime: t.dueTime!,
      text,
    }
    if (!best || Math.abs(delta) < Math.abs(best.deltaMin)) best = candidate
  }
  return best
}
