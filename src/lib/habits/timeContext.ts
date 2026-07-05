// SIR V2 — Hábitos: contexto temporal (helper puro compartido por 12·M1/M4/M5).
//
// Mapea horas a "franjas" del día en el vocabulario con el que Aaron habla, y
// parsea franjas/horas desde texto libre (para el WOOP: "por la mañana",
// "después de almorzar"). Sin Intl, determinístico. Reloj Lima ya resuelto por
// quien llama (le pasa minutos-del-día o 'HH:MM').

export type Franja = 'madrugada' | 'mañana' | 'mediodia' | 'tarde' | 'noche'

export const FRANJA_LABEL: Record<Franja, string> = {
  madrugada: 'de madrugada',
  mañana: 'por la mañana',
  mediodia: 'al mediodía',
  tarde: 'por la tarde',
  noche: 'por la noche',
}

/** Hora (0-23) → franja del día. */
export function franjaOfHour(hour: number): Franja {
  if (hour < 6) return 'madrugada'
  if (hour < 12) return 'mañana'
  if (hour < 15) return 'mediodia'
  if (hour < 20) return 'tarde'
  return 'noche'
}

/** 'HH:MM' → minutos del día (0-1439). null si inválido. */
export function hhmmToMinutes(hhmm: string | undefined | null): number | null {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Intenta extraer una franja de un texto libre de plan_if. Reconoce nombres de
 * franja y anclas cotidianas ("después de almorzar" → mediodía, "antes de
 * dormir" → noche). null si no hay señal temporal clara.
 */
export function detectFranjaFromText(text: string | null | undefined): Franja | null {
  if (!text) return null
  const t = norm(text)
  // Anclas cotidianas primero (más específicas).
  if (/(antes de dormir|antes de acostar|al acostar|antes de la cama)/.test(t)) return 'noche'
  if (/(al despertar|apenas me levanto|al levantarme|antes del desayuno|primera hora)/.test(t)) return 'mañana'
  if (/(despues de almorzar|post almuerzo|luego de almorzar|al almuerzo)/.test(t)) return 'mediodia'
  if (/(despues de cenar|luego de cenar|post cena)/.test(t)) return 'noche'
  // Nombres de franja.
  if (/madrugada/.test(t)) return 'madrugada'
  if (/(mañana|manana|matutin|amanec)/.test(t)) return 'mañana'
  if (/(mediodia|almuerzo|medio dia)/.test(t)) return 'mediodia'
  if (/(tarde|vespertin)/.test(t)) return 'tarde'
  if (/(noche|nocturn|anochec)/.test(t)) return 'noche'
  return null
}

/** Intenta extraer una hora 'HH:MM' de un texto ("a las 7", "7am", "19:30"). */
export function detectHourFromText(text: string | null | undefined): number | null {
  if (!text) return null
  const t = norm(text)
  // HH:MM
  const hhmm = t.match(/\b(\d{1,2}):(\d{2})\b/)
  if (hhmm) {
    const h = Number(hhmm[1])
    if (h <= 23) return h
  }
  // "a las 7" / "7am" / "7 pm"
  const m = t.match(/\b(?:a las |las )?(\d{1,2})\s*(am|pm|hs|h)?\b/)
  if (m) {
    let h = Number(m[1])
    const mer = m[2]
    if (h <= 23) {
      if (mer === 'pm' && h < 12) h += 12
      if (mer === 'am' && h === 12) h = 0
      return h
    }
  }
  return null
}
