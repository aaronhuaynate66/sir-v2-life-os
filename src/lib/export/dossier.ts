// SIR V2 — Armado de datos del Dossier de persona (Export, Parte A).
//
// Consolida en una estructura plana lo CLAVE de una persona para la vista
// imprimible: identidad, contacto, "Lo personal", fechas importantes, redes
// y una línea de tiempo reciente (person_logs + observations). PURO +
// determinístico (recibe `now`) → testeable. El componente sólo renderiza.

import type { Person } from '@/types'
import type { Observation } from '@/lib/capture/observations/types'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import {
  sortSpecialDates,
  formatSpecialDate,
  formatCountdownPhrase,
} from '@/lib/dates/specialDates'

const DAY_MS = 86_400_000

const RELATIONSHIP_LABEL: Record<Person['relationship'], string> = {
  family: 'Familia',
  friend: 'Amigo/a',
  romantic: 'Pareja',
  professional: 'Profesional',
  mentor: 'Mentor/a',
  mentee: 'Aprendiz',
  acquaintance: 'Conocido/a',
}

const CATEGORY_LABEL: Record<Person['category'], string> = {
  inner_circle: 'Círculo cercano',
  close: 'Cercano',
  network: 'Network',
  peripheral: 'Periférico',
}

const LOG_KIND_LABEL: Record<PersonLogKind, string> = {
  mood: 'Ánimo',
  energy: 'Energía',
  sleep: 'Sueño',
  pain: 'Dolor',
  interaction: 'Interacción',
}

export interface DossierIdentity {
  name: string
  alias?: string
  relationshipLabel: string
  categoryLabel: string
  location?: string
  importanceScore: number
  trustLevel: number
  slug?: string
}

export interface DossierSpecialDate {
  label: string
  dateFormatted: string
  countdownPhrase: string
}

export interface DossierNetworks {
  phone?: string
  instagram?: string
  linkedin?: string
  twitter?: string
}

export interface DossierEvent {
  /** ISO original (para orden estable / render). */
  dateIso: string
  /** Fecha legible "YYYY-MM-DD HH:mm" o "YYYY-MM-DD". */
  dateFormatted: string
  source: 'log' | 'observation'
  label: string
  detail: string
}

export interface DossierData {
  identity: DossierIdentity
  /** Días enteros desde el último contacto. null si no hay lastContact. */
  daysSinceContact: number | null
  lastContactFormatted: string | null
  /** Texto de "Lo personal" (síntesis), si existe. */
  personal: string | null
  specialDates: DossierSpecialDate[]
  networks: DossierNetworks
  /** Eventos recientes (logs + observations) más nuevos primero, limitado. */
  recentTimeline: DossierEvent[]
  hasNetworks: boolean
  generatedAtIso: string
}

export interface BuildDossierInput {
  person: Person
  personalSynthesis?: string | null
  personLogs?: PersonLog[]
  observations?: Observation[]
  /** Máximo de eventos en la línea de tiempo. Default 15. */
  timelineLimit?: number
}

function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/)
  if (!m) return iso
  return m[2] ? `${m[1]} ${m[2]}` : m[1]
}

export function buildDossier(
  input: BuildDossierInput,
  now: Date = new Date(),
): DossierData {
  const { person } = input
  const timelineLimit = input.timelineLimit ?? 15

  // Contacto.
  const lastContact = parseLocalDate(person.lastContact)
  let daysSinceContact: number | null = null
  if (lastContact) {
    const diff = startOfDay(now).getTime() - lastContact.getTime()
    daysSinceContact = diff >= 0 ? Math.floor(diff / DAY_MS) : null
  }

  // Fechas importantes: reusa el sort + formatters canónicos.
  const { valid } = sortSpecialDates(person.specialDates ?? [], now)
  const specialDates: DossierSpecialDate[] = valid.map((cd) => ({
    label: cd.sd.label,
    dateFormatted: formatSpecialDate(cd),
    countdownPhrase: formatCountdownPhrase(cd),
  }))

  // Redes (solo las presentes).
  const networks: DossierNetworks = {
    phone: person.phoneNumber || undefined,
    instagram: person.instagramHandle || undefined,
    linkedin: person.linkedinUrl || undefined,
    twitter: person.twitterHandle || undefined,
  }
  const hasNetworks = Boolean(
    networks.phone || networks.instagram || networks.linkedin || networks.twitter,
  )

  // Línea de tiempo: merge logs + observations, más nuevos primero.
  const logEvents: DossierEvent[] = (input.personLogs ?? []).map((l) => ({
    dateIso: l.loggedAt,
    dateFormatted: fmtDateTime(l.loggedAt),
    source: 'log',
    label: LOG_KIND_LABEL[l.kind] ?? l.kind,
    detail: [`valor ${l.value}/5`, l.note].filter(Boolean).join(' · '),
  }))
  const obsEvents: DossierEvent[] = (input.observations ?? []).map((o) => ({
    dateIso: o.observedAt,
    dateFormatted: fmtDateTime(o.observedAt),
    source: 'observation',
    label: o.captureType,
    detail: o.confidence ? `confianza ${o.confidence}` : '',
  }))
  const recentTimeline = [...logEvents, ...obsEvents]
    .sort((a, b) => (b.dateIso ?? '').localeCompare(a.dateIso ?? ''))
    .slice(0, timelineLimit)

  return {
    identity: {
      name: person.name,
      alias: person.alias || undefined,
      relationshipLabel: RELATIONSHIP_LABEL[person.relationship] ?? person.relationship,
      categoryLabel: CATEGORY_LABEL[person.category] ?? person.category,
      location: person.location || undefined,
      importanceScore: person.importanceScore,
      trustLevel: person.trustLevel,
      slug: person.slug,
    },
    daysSinceContact,
    lastContactFormatted: lastContact ? fmtDateTime(person.lastContact) : null,
    personal: input.personalSynthesis?.trim() ? input.personalSynthesis.trim() : null,
    specialDates,
    networks,
    recentTimeline,
    hasNetworks,
    generatedAtIso: now.toISOString(),
  }
}
