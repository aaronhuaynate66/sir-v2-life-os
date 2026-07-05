// SIR V2 — Hábitos 12·M5: disparar el WOOP cuando ocurre el "if" (Gollwitzer,
// intenciones de implementación). Confianza media.
//
// Un `plan_if`/`plan_then` guardado es texto muerto hasta que el "if" se cumple.
// Este motor detecta cuándo el contexto ACTUAL matchea el "if" — empezando por
// los disparadores TEMPORALES (una franja, una hora) y de ESTADO (estrés), que
// SIR sí puede observar — y devuelve el `plan_then` como prompt vivo. Honesto: si
// el "if" no es detectable, NO se dispara (cero falsos positivos). PURO.

import { LIMA_UTC_OFFSET_HOURS } from '@/lib/calendar/tz'
import { detectFranjaFromText, detectHourFromText, franjaOfHour, FRANJA_LABEL } from './timeContext'

export interface WoopPlan {
  goalId: string
  goalTitle: string
  planIf: string
  planThen: string
}

export interface WoopTrigger {
  goalId: string
  goalTitle: string
  planThen: string
  /** Por qué se disparó (para mostrar con honestidad). */
  reason: string
}

const HOUR_MS = 3_600_000
const STRESS_RE = /(estres|estrés|ansios|abrumad|nervios|tension|tensión|angusti)/i

/** Palabras que sugieren que el "if" es de estado emocional (no temporal). */
function mentionsStress(text: string): boolean {
  return STRESS_RE.test(text)
}

/**
 * Devuelve los WOOP cuyo "if" se cumple AHORA. Sólo dispara disparadores
 * detectables (franja/hora/estrés); los ambiguos se ignoran. PURO.
 */
export function activeWoopTriggers(
  plans: WoopPlan[],
  nowMs: number,
  opts?: { stressElevated?: boolean },
): WoopTrigger[] {
  const limaHour = new Date(nowMs - LIMA_UTC_OFFSET_HOURS * HOUR_MS).getUTCHours()
  const currentFranja = franjaOfHour(limaHour)
  const out: WoopTrigger[] = []

  for (const p of plans) {
    const iff = (p.planIf ?? '').trim()
    const then = (p.planThen ?? '').trim()
    if (!iff || !then) continue

    // 1) Estado: "cuando esté estresado" + estrés elevado ahora.
    if (opts?.stressElevated && mentionsStress(iff)) {
      out.push({ goalId: p.goalId, goalTitle: p.goalTitle, planThen: then, reason: 'estás con el estrés alto ahora' })
      continue
    }

    // 2) Hora explícita en el "if" (±1h del ahora).
    const hour = detectHourFromText(iff)
    if (hour != null && Math.abs(hour - limaHour) <= 1) {
      out.push({ goalId: p.goalId, goalTitle: p.goalTitle, planThen: then, reason: `es alrededor de las ${hour}h` })
      continue
    }

    // 3) Franja del "if" == franja actual.
    const franja = detectFranjaFromText(iff)
    if (franja && franja === currentFranja) {
      out.push({ goalId: p.goalId, goalTitle: p.goalTitle, planThen: then, reason: `es ${FRANJA_LABEL[franja]}` })
      continue
    }
  }
  return out
}
