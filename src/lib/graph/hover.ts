// SIR V2 — Hover del grafo: arma info accionable del vínculo (puro, testeable).
//
// Combina campos de la persona (edad desde birthDate, fase de ciclo) con datos
// server (última interacción + ánimo, vía InteractionInfo) y la última
// recomendación (del store, client). El render del tooltip (hoverToHtml) es
// también puro y escapa el texto del usuario.

import type { Person } from '@/types'
import { cyclePhase } from '@/lib/ciclo/phase'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'

/** Resumen de la última interacción (lo arma el server desde obs/person_logs). */
export interface InteractionInfo {
  /** ISO de la última interacción (max de observation/person_log). */
  at: string
  /** Etiqueta corta: "WhatsApp", "Interacción 4/5", etc. */
  label: string
  /** Último ánimo registrado (kind='mood'), si hay. Ej. "Ánimo 4/5". */
  mood?: string
}

export interface NodeHover {
  age?: number
  /** "Folicular · día 8" (+ "· período en 3d" si aplica). */
  cycle?: string
  /** "WhatsApp · hace 3d". */
  lastInteraction?: string
  /** "Ánimo 4/5". */
  mood?: string
  /** Texto (truncado) de la última recomendación. */
  recommendation?: string
  /** Fallback siempre presente: "Pareja · Personal" etc. */
  relationLabel?: string
}

const REL_LABEL: Record<Person['relationship'], string> = {
  family: 'Familia',
  friend: 'Amigo/a',
  romantic: 'Pareja',
  professional: 'Profesional',
  mentor: 'Mentor/a',
  mentee: 'Aprendiz',
  acquaintance: 'Conocido/a',
}

const DAY_MS = 86_400_000

/** Edad en años a partir de un ISO YYYY-MM-DD (TZ-local). null si inválido o sin año real. */
export function ageFromBirthDate(birthDate: string | undefined, now: Date): number | null {
  if (!birthDate) return null
  const born = parseLocalDate(birthDate)
  if (!born || born.getFullYear() < 1900) return null
  let age = now.getFullYear() - born.getFullYear()
  const beforeBirthday =
    now.getMonth() < born.getMonth() ||
    (now.getMonth() === born.getMonth() && now.getDate() < born.getDate())
  if (beforeBirthday) age -= 1
  return age >= 0 && age < 130 ? age : null
}

/** Tiempo relativo compacto en español. Usa el instante completo (los `at`
 *  vienen como timestamptz ISO), no date-only. */
export function relativeEs(iso: string, now: Date): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const diff = now.getTime() - t
  if (diff < 0) return 'programado'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return mins < 1 ? 'recién' : `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(diff / DAY_MS)
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days}d`
  if (days < 30) return `hace ${Math.floor(days / 7)}sem`
  if (days < 365) return `hace ${Math.floor(days / 30)}mes`
  return `hace ${Math.floor(days / 365)}a`
}

export interface BuildHoverArgs {
  person: Person
  interaction?: InteractionInfo
  recommendation?: string
  now: Date
}

/** Arma el NodeHover combinando persona + interacción + recomendación. */
export function buildHover({ person, interaction, recommendation, now }: BuildHoverArgs): NodeHover {
  const hover: NodeHover = {}

  const age = ageFromBirthDate(person.birthDate, now)
  if (age != null) hover.age = age

  if (person.cycleStartDate) {
    const cp = cyclePhase(person.cycleStartDate, person.cycleLengthDays ?? 28, now)
    if (cp) {
      hover.cycle =
        `${cp.label} · día ${cp.cycleDay}` +
        (cp.daysUntilNextPeriod >= 0 && cp.daysUntilNextPeriod <= 7
          ? ` · período en ${cp.daysUntilNextPeriod}d`
          : '')
    }
  }

  if (interaction?.at) {
    const rel = relativeEs(interaction.at, now)
    hover.lastInteraction = rel ? `${interaction.label} · ${rel}` : interaction.label
  }
  if (interaction?.mood) hover.mood = interaction.mood

  if (recommendation && recommendation.trim()) {
    const t = recommendation.trim()
    hover.recommendation = t.length > 90 ? `${t.slice(0, 90)}…` : t
  }

  hover.relationLabel = REL_LABEL[person.relationship] ?? undefined

  return hover
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Render del tooltip a HTML (react-force-graph nodeLabel lo inyecta como
 * innerHTML). Escapamos todo el texto del usuario. Compacto y oscuro.
 */
export function hoverToHtml(fullName: string, hover: NodeHover | undefined): string {
  const lines: string[] = []
  const row = (labelIcon: string, value: string) =>
    `<div style="display:flex;gap:6px;margin-top:3px;font-size:11px;line-height:1.35;"><span style="opacity:.6;flex-shrink:0;">${labelIcon}</span><span>${esc(value)}</span></div>`

  if (hover?.lastInteraction) lines.push(row('💬', hover.lastInteraction))
  if (hover?.recommendation) lines.push(row('💡', hover.recommendation))
  if (hover?.mood) lines.push(row('🙂', hover.mood))
  if (hover?.age != null) lines.push(row('🎂', `${hover.age} años`))
  if (hover?.cycle) lines.push(row('🌙', hover.cycle))

  // Fallback: si no hubo nada accionable, mostrar al menos la relación.
  if (lines.length === 0 && hover?.relationLabel) lines.push(row('•', hover.relationLabel))

  const header = `<div style="font-weight:600;font-size:12px;">${esc(fullName)}</div>`
  const body = lines.length
    ? lines.join('')
    : `<div style="margin-top:3px;font-size:11px;opacity:.7;">Sin interacciones registradas</div>`

  return (
    `<div style="background:rgba(10,10,10,.92);color:#f5f5f5;border:1px solid rgba(255,255,255,.12);` +
    `border-radius:8px;padding:8px 10px;max-width:240px;box-shadow:0 4px 16px rgba(0,0,0,.5);">` +
    header +
    body +
    `</div>`
  )
}
