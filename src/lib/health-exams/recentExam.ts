// SIR V2 — "Tu examen reciente tiene recomendaciones sin revisar". PURO.
//
// ═══ POR QUÉ EXISTE ══════════════════════════════════════════════════════════
//
// El brief leía `health_exams` **solo los lunes** y **solo** para emitir la línea de
// tendencias de laboratorio. Ese gate semanal está bien para lo crónico: un analito
// que deriva a lo largo de un año no es noticia diaria.
//
// Pero deja afuera lo contrario: **un examen RECIÉN hecho, cuyas recomendaciones son
// accionables HOY**. Medido el 31-jul-2026: la tomografía de emergencia del 27-jul se
// cargó con 11 recomendaciones —una de ellas la bandera roja del hematoma septal, que
// tiene ventana de **5 a 7 días**— y el brief no la iba a mencionar hasta el lunes
// siguiente, cuando la ventana ya habría cerrado.
//
// Y ni siquiera entonces: `labAlertPushLine` deriva de `values` NUMÉRICOS, y un
// examen de imagen no tiene ninguno. La tomografía era invisible para el brief por
// dos motivos a la vez.
//
// Es el mismo hilo de siempre en este repo: SIR guardaba las 11 recomendaciones y no
// surfaceaba ninguna. Ver `renderExamsBlock` en `lib/sir/ask.ts` para el lado del chat.

import type { HealthExam } from './types'

/** Ventana en la que un examen todavía cuenta como "reciente" y por tanto accionable. */
export const VENTANA_RECIENTE_DIAS = 14

const DAY = 86_400_000

function diasDesde(fecha: string, hoy: string): number | null {
  const a = Date.parse(`${fecha}T00:00:00Z`)
  const b = Date.parse(`${hoy}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / DAY)
}

/** "hoy" | "ayer" | "hace N días". PURA. */
export function cuandoFue(dias: number): string {
  if (dias <= 0) return 'de hoy'
  if (dias === 1) return 'de ayer'
  return `de hace ${dias} días`
}

export interface ExamenReciente {
  exam: HealthExam
  dias: number
  /** Recomendaciones no vacías del examen. */
  recomendaciones: string[]
}

/**
 * El examen reciente MÁS relevante con recomendaciones, o null. PURO.
 *
 * "Más relevante" = el más nuevo dentro de la ventana. Si hay dos del mismo día
 * (pasa: en una emergencia se emiten varios informes), gana el que trae más
 * recomendaciones — es el que tiene más que decir.
 */
export function examenRecienteConRecomendaciones(
  exams: readonly HealthExam[],
  hoy: string,
): ExamenReciente | null {
  const candidatos: ExamenReciente[] = []
  for (const e of exams ?? []) {
    if (!e?.examDate || !e?.title) continue
    const dias = diasDesde(e.examDate, hoy)
    // Un examen con fecha FUTURA no se anuncia: es data mal cargada, no un pendiente.
    if (dias === null || dias < 0 || dias > VENTANA_RECIENTE_DIAS) continue
    const recomendaciones = (e.recommendations ?? []).filter((r) => typeof r === 'string' && r.trim())
    if (recomendaciones.length === 0) continue
    candidatos.push({ exam: e, dias, recomendaciones })
  }
  if (candidatos.length === 0) return null
  candidatos.sort((a, b) => (a.dias - b.dias) || (b.recomendaciones.length - a.recomendaciones.length))
  return candidatos[0]
}

/**
 * ═══ IDENTIDAD DE LA SEÑAL — el mismo defecto que tenía el slot de eventos ════
 *
 * `examenReciente` vivía en `AGGREGATE_SLOTS`, así que su identidad para el
 * anti-repetición era el SLOT: `slot:examenReciente`, una clave que no cambia
 * nunca. El razonamiento era el de siempre y es correcto a medias — el texto
 * cambia solo por el paso del tiempo ("de hace 8 días" → "de hace 9 días"), y
 * hashear el texto rompía la racha cada mañana.
 *
 * Lo que no se vio es que el texto TAMBIÉN cambia porque entra un examen NUEVO.
 * Y bajo una clave fija los dos casos son indistinguibles, exactamente como pasó
 * con `eventosProximos` (#1092).
 *
 * Medido el 4-ago-2026: `slot:examenReciente` se durmió ese día por racha (4
 * mañanas seguidas hablando de la tomografía del 27-jul) y con `SNOOZE_DAYS = 14`
 * no despertaba hasta el **18-ago**. El examen médico del IPD es el **7-ago**: sus
 * recomendaciones habrían entrado a un slot dormido y no se habrían nombrado en 11
 * días. Un examen recién hecho es justo lo contrario de una repetición.
 *
 * La identidad es QUÉ examen es (fecha + título) más cuántas recomendaciones trae:
 * el mismo examen contado día tras día conserva la clave y la racha corre como
 * debe; un examen nuevo es una señal nueva.
 */
export function examenRecienteIdentity(
  exams: readonly HealthExam[],
  hoy: string,
): string | null {
  const r = examenRecienteConRecomendaciones(exams, hoy)
  if (!r) return null
  const slug = (r.exam.title ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `${r.exam.examDate}~${slug}+${r.recomendaciones.length}`
}

/** Días en los que un examen es tan fresco que su aviso no se puede callar. */
export const RECIEN_HECHO_DIAS = 2

/**
 * ¿El examen es tan reciente que su aviso NO debe silenciarse? PURA.
 *
 * La segunda defensa, igual que con los eventos. Con la identidad arreglada la
 * racha casi nunca llega a dormirse, pero "casi" no alcanza cuando lo que está en
 * juego es una recomendación con ventana de días — la bandera roja del hematoma
 * septal de la tomografía del 27-jul tenía ventana de 5 a 7.
 */
export function examenRecienImperdible(
  exams: readonly HealthExam[],
  hoy: string,
): boolean {
  const r = examenRecienteConRecomendaciones(exams, hoy)
  return !!r && r.dias <= RECIEN_HECHO_DIAS
}

/**
 * La línea del brief. null si no hay examen reciente con recomendaciones. PURA.
 *
 * Dice CUÁNTAS son y muestra UNA — la primera, que es donde el cargador pone lo más
 * urgente. Un muro de 11 recomendaciones en el brief es exactamente el ruido del que
 * Aaron se quejó (#1039); el resto se lee preguntándole a SIR, que ahora sí las ve.
 */
export function examenRecienteLine(
  exams: readonly HealthExam[],
  hoy: string,
): string | null {
  const r = examenRecienteConRecomendaciones(exams, hoy)
  if (!r) return null
  const n = r.recomendaciones.length
  const cuantas = n === 1 ? '1 recomendación' : `${n} recomendaciones`
  const primera = r.recomendaciones[0].replace(/\s+/g, ' ').trim()
  const corta = primera.length > 180 ? `${primera.slice(0, 177)}…` : primera
  const resto = n > 1 ? ` (pregúntame por las otras ${n - 1})` : ''
  return `🩺 Tu "${r.exam.title}" ${cuandoFue(r.dias)} tiene ${cuantas}${resto}. La primera: ${corta}`
}
