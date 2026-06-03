// SIR V2 — Anclas de identidad (perfil propio del dueño de la app).
//
// Datos básicos de identidad de Aaron, base del motor proactivo: nombre,
// fecha de nacimiento (→ edad), roles/ocupación, ubicación y sus propias
// fechas importantes recurrentes. Es un SINGLETON por usuario (una fila en
// `identity_profile`, ver useSelfStore + adapters/self.ts), igual que el
// diagnóstico personal: el cliente genera un id una vez (`idn_<ts>`) y lo
// reusa en cada edición (upsert por id).
//
// Estos helpers son PUROS y determinísticos (salvo el `now` que reciben con
// default new Date(), patrón del resto de utils de fecha). La edad se calcula
// en TZ LOCAL vía parseLocalDate, para no correr el día en Lima (UTC-5).
//
// El tipo vive acá (módulo de dominio) y no en types/index.ts a propósito:
// `SpecialDate` sí es transversal y se importa de @/types.

import type { SpecialDate } from '@/types'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'

/** Perfil propio / anclas de identidad. Singleton por usuario. */
export interface IdentityProfile {
  /** Id estable generado en cliente (`idn_<ts>`), reusado en cada upsert. */
  id: string
  /** Nombre completo (texto libre). */
  fullName: string
  /** Fecha de nacimiento ISO date-only (YYYY-MM-DD). null = no seteada.
   *  Se parsea en TZ local (parseLocalDate) para la edad. */
  birthDate: string | null
  /** Roles / ocupación como tags (ej. "Bombero", "Fundador de Marlab",
   *  "Atleta de taekwondo"). Lista deduplicada. */
  roles: string[]
  /** Ubicación (texto libre, ej. "Lima, Perú"). */
  location: string
  /** Fechas importantes PROPIAS (aniversarios, fechas personales). Mismo
   *  shape que las de una persona — se renderizan con specialDates.ts. */
  specialDates: SpecialDate[]
  updatedAt: string
}

/**
 * Perfil vacío. El id se genera una vez en cliente y se reusa (upsert por id).
 * updatedAt = epoch para marcar "nunca editado".
 */
export function emptyIdentityProfile(id: string): IdentityProfile {
  return {
    id,
    fullName: '',
    birthDate: null,
    roles: [],
    location: '',
    specialDates: [],
    updatedAt: new Date(0).toISOString(),
  }
}

/** ¿El perfil no tiene NINGÚN dato de identidad cargado? (empty-state). Las
 *  fechas importantes no cuentan acá: el empty-state es sobre las anclas. */
export function isIdentityEmpty(p: IdentityProfile | null | undefined): boolean {
  if (!p) return true
  return (
    p.fullName.trim() === '' &&
    !p.birthDate &&
    p.roles.length === 0 &&
    p.location.trim() === ''
  )
}

/**
 * Normaliza un draft a una entidad lista para persistir: recorta textos,
 * limpia/deduplica roles, valida la fecha de nacimiento (null si inválida) y
 * preserva las fechas importantes tal cual (se editan aparte). No muta.
 */
export function normalizeIdentityProfile(draft: IdentityProfile): IdentityProfile {
  const seen = new Set<string>()
  const roles: string[] = []
  for (const raw of draft.roles) {
    const v = raw.trim()
    if (v === '' || seen.has(v)) continue
    seen.add(v)
    roles.push(v)
  }
  // Solo aceptamos una fecha de nacimiento válida (round-trip de parseLocalDate);
  // cualquier otra cosa queda null (sin fecha) en vez de persistir basura.
  const birthDate =
    draft.birthDate && parseLocalDate(draft.birthDate) ? draft.birthDate.slice(0, 10) : null
  return {
    id: draft.id,
    fullName: draft.fullName.trim(),
    birthDate,
    roles,
    location: draft.location.trim(),
    specialDates: draft.specialDates,
    updatedAt: draft.updatedAt,
  }
}

/**
 * Edad en años cumplidos a partir de una fecha de nacimiento date-only.
 * Devuelve null si la fecha es inválida, futura, o el año es < 1900.
 *
 * Calcula en TZ local (parseLocalDate + componentes locales de `now`) para
 * que el día no se corra en Lima (UTC-5). Un nacido 29-feb cuenta el año
 * recién al pasar febrero en años no bisiestos (criterio consistente con
 * BirthdayCountdown).
 */
export function computeAge(
  birthDate: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!birthDate) return null
  const birth = parseLocalDate(birthDate)
  if (!birth) return null
  if (birth.getFullYear() < 1900) return null

  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  let age = y - birth.getFullYear()
  // ¿Ya pasó (o es) el cumpleaños este año?
  const hadBirthday =
    m > birth.getMonth() || (m === birth.getMonth() && d >= birth.getDate())
  if (!hadBirthday) age -= 1

  return age >= 0 ? age : null
}
