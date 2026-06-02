// SIR V2 — Motor de rituales relacionales (GEMA B, reglas, sin IA).
//
// Portado de SIR v1 (`api/rituals/engine/route.ts`): reglas DETERMINISTAS y
// baratas que disparan sugerencias accionables sin tocar el LLM —
// cumpleaños, reconexión por contacto frío, follow-ups, vínculos enfriándose.
//
// Adaptado al modelo de V2:
//   - birthday/aniversario/fechas → people.birthDate + people.specialDates,
//     vía computeSpecialDateCountdown (una sola fuente de countdowns; maneja
//     feb-29 e infiere recurrencia por etiqueta).
//   - contacto frío → daysSinceContact (chat real + registro manual, lo arma
//     la capa de datos del route).
//   - enfriándose → relationship.status 'strained' o fuerza baja con actividad.
//   - reconocer novedad → señal reciente ligada a la persona (3-21d).
//
// PURA + determinística: `now` inyectable, sin I/O. Testeable.

import type { Person, RelationshipStatus, SignalType } from '@/types'
import { computeSpecialDateCountdown } from '@/lib/dates/specialDates'

export type RitualType =
  | 'no_contact'
  | 'birthday'
  | 'special_date'
  | 'cooling'
  | 'acknowledge'

export interface Ritual {
  personId: string
  personName: string
  personSlug?: string
  type: RitualType
  /** Qué pasa ("Hace 3 semanas sin hablar con X"). */
  message: string
  /** Qué hacer ("Escribile para retomar"). */
  action: string
  /** 1-10 (10 = hoy/urgente). */
  priority: number
  /** Días hasta la fecha, si el ritual es por fecha. */
  daysUntil?: number
}

/** Señal mínima que el motor necesita (subconjunto de Signal). */
export interface RitualSignal {
  type: SignalType
  detectedAt: string
  actionRequired: boolean
}

export interface RitualPersonInput {
  person: Person
  /** Días desde la última interacción (chat o registro manual). null = nunca. */
  daysSinceContact: number | null
  /** Fuerza 0-100 (de computeRelationalScore) — gatea no_contact/cooling. */
  fuerza: number
  /** Status del vínculo (relationships.status), si existe. */
  status?: RelationshipStatus
  /** Señales recientes ligadas a esta persona (cualquier antigüedad; el motor filtra). */
  recentSignals?: RitualSignal[]
}

const ANNIVERSARY_HINTS = ['aniver', 'boda', 'matrimonio', 'noviazgo']
const SAINT_HINTS = ['santo']

function normalizeLabel(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function pluralDias(n: number): string {
  return `${n} día${n === 1 ? '' : 's'}`
}

/** Genera los rituales de UNA persona (reglas independientes; puede devolver varios). */
function ritualsForPerson(input: RitualPersonInput, now: Date): Ritual[] {
  const { person, daysSinceContact: days, fuerza, status } = input
  const out: Ritual[] = []
  const base = { personId: person.id, personName: person.name, personSlug: person.slug }

  // 1. Contacto frío ≥21d (sólo si el vínculo importa: fuerza > 20). Como v1.
  if (days !== null && days >= 21 && fuerza > 20) {
    const weeks = Math.floor(days / 7)
    out.push({
      ...base,
      type: 'no_contact',
      message:
        weeks <= 8
          ? `Hace ${weeks} semana${weeks === 1 ? '' : 's'} sin hablar con ${person.name}`
          : `Hace ${days} días sin hablar con ${person.name}`,
      action: 'Escribile o llamalo para retomar el contacto',
      priority: days >= 60 ? 9 : days >= 45 ? 8 : 7,
    })
  }

  // 2. Cumpleaños ≤7d.
  if (person.birthDate) {
    const cd = computeSpecialDateCountdown(
      { id: `bday_${person.id}`, label: 'Cumpleaños', date: person.birthDate, recurring: true },
      now,
    )
    if (cd && cd.daysUntil >= 0 && cd.daysUntil <= 7) {
      out.push({
        ...base,
        type: 'birthday',
        message:
          cd.daysUntil === 0
            ? `¡Hoy es el cumpleaños de ${person.name}!`
            : `El cumpleaños de ${person.name} es en ${pluralDias(cd.daysUntil)}`,
        action: cd.daysUntil === 0 ? 'Saludalo hoy' : 'Prepará un mensaje (o un detalle)',
        priority: cd.daysUntil === 0 ? 10 : cd.daysUntil <= 2 ? 9 : 8,
        daysUntil: cd.daysUntil,
      })
    }
  }

  // 3. Fechas especiales ≤14d (aniversarios, santos, fechas custom).
  for (const sd of person.specialDates ?? []) {
    const cd = computeSpecialDateCountdown(sd, now)
    if (!cd || cd.isPast || cd.daysUntil < 0 || cd.daysUntil > 14) continue
    const n = normalizeLabel(sd.label)
    const isAnniv = ANNIVERSARY_HINTS.some((h) => n.includes(h))
    const isSaint = SAINT_HINTS.some((h) => n.includes(h))
    out.push({
      ...base,
      type: 'special_date',
      message:
        cd.daysUntil === 0
          ? `Hoy es "${sd.label}" con ${person.name}`
          : `En ${pluralDias(cd.daysUntil)} — "${sd.label}" con ${person.name}`,
      action: isAnniv
        ? cd.daysUntil <= 1
          ? 'Confirmá tu plan'
          : 'Planeá algo especial'
        : isSaint
          ? 'Mandale un saludo'
          : 'Tenelo presente con un gesto',
      priority: cd.daysUntil <= 1 ? 9 : cd.daysUntil <= 7 ? 7 : 6,
      daysUntil: cd.daysUntil,
    })
  }

  // 4. Vínculo enfriándose: tenso, o fuerza baja (10-40) con interacción reciente.
  const recentSignals = input.recentSignals ?? []
  const hasActivity = recentSignals.length > 0 || (days !== null && days <= 30)
  if (status === 'strained') {
    out.push({
      ...base,
      type: 'cooling',
      message: `Tu relación con ${person.name} está tensa`,
      action: 'Buscá un momento para destensar con un gesto concreto',
      priority: 6,
    })
  } else if (fuerza > 10 && fuerza < 40 && hasActivity) {
    out.push({
      ...base,
      type: 'cooling',
      message: `Tu vínculo con ${person.name} se está enfriando (fuerza ${Math.round(fuerza)}/100)`,
      action: 'Retomá el contacto con una acción concreta',
      priority: 6,
    })
  }

  // 5. Reconocer una novedad reciente sin atender (señal ligada 3-21d).
  const ackSignal = recentSignals.find((s) => {
    const ageDays = (now.getTime() - new Date(s.detectedAt).getTime()) / 86_400_000
    if (!(ageDays >= 3 && ageDays <= 21)) return false
    return s.actionRequired || s.type === 'opportunity' || s.type === 'relational'
  })
  if (ackSignal) {
    out.push({
      ...base,
      type: 'acknowledge',
      message: `${person.name} tuvo una novedad que aún no reconociste`,
      action: 'Mandale un mensaje mostrando interés genuino',
      priority: 7,
    })
  }

  return out
}

/**
 * Genera todos los rituales de la red, ordenados por prioridad (desc), luego
 * por cercanía de fecha. Determinista: dado el mismo input + `now`, mismo orden.
 */
export function generateRituals(inputs: RitualPersonInput[], now: Date = new Date()): Ritual[] {
  const out: Ritual[] = []
  for (const input of inputs) {
    out.push(...ritualsForPerson(input, now))
  }
  out.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    const ad = a.daysUntil ?? 999
    const bd = b.daysUntil ?? 999
    if (ad !== bd) return ad - bd
    return a.personName.localeCompare(b.personName, 'es')
  })
  return out
}
