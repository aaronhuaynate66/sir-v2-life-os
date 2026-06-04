// SIR V2 — Fusión PURA de una auto-captura dentro del perfil de identidad.
//
// Toma lo que Visión extrajo del propio perfil (SelfProfileExtracted, ya
// consolidado) y lo combina con el IdentityProfile existente para producir una
// PROPUESTA editable. Reglas (clave: NUNCA pisar silenciosamente lo que Aaron
// escribió a mano):
//   - roles:     MERGE (existentes + extraídos), deduplicado.
//   - interests: MERGE (existentes + intereses + SKILLS de LinkedIn), dedup.
//   - location/fullName/bio/trajectory: RELLENAN solo si están vacíos; si ya hay
//     algo, se respeta lo existente (igual la propuesta es editable en la UI).
//   - birthDate / specialDates: intactos (la captura no los toca).
//
// Devuelve la propuesta + un resumen de qué cambió, para que la UI lo muestre y
// el usuario revise/corrija ANTES de guardar. Puro y testeado.

import type { SelfProfileExtracted } from '@/lib/capture/self-profile/types'
import { cleanTagList, type IdentityProfile } from './index'

export interface CaptureProposalDiff {
  /** Roles que la captura agrega (no estaban antes). */
  addedRoles: string[]
  /** Intereses que la captura agrega (incluye skills de LinkedIn). */
  addedInterests: string[]
  /** Campos que estaban vacíos y la captura propone rellenar. */
  filled: Array<{ field: 'fullName' | 'birthDate' | 'location' | 'bio' | 'trajectory'; value: string }>
}

export interface CaptureProposal {
  proposed: IdentityProfile
  diff: CaptureProposalDiff
  /** ¿La captura aporta algo nuevo sobre lo que ya había? */
  hasChanges: boolean
}

function fillIfEmpty(
  existing: string,
  incoming: string | null,
): { value: string; filled: string | null } {
  const cur = existing.trim()
  if (cur) return { value: existing, filled: null }
  const next = (incoming ?? '').trim()
  if (!next) return { value: existing, filled: null }
  return { value: next, filled: next }
}

/**
 * Construye la propuesta de identidad fusionando `extracted` sobre `existing`.
 * `existing` debe ser un IdentityProfile (el caller crea uno vacío si no había).
 */
export function buildCaptureProposal(
  existing: IdentityProfile,
  extracted: SelfProfileExtracted,
): CaptureProposal {
  // Set de lo ya presente (case-insensitive) para calcular el "added".
  const haveRoles = new Set(existing.roles.map((r) => r.toLowerCase()))
  const haveInterests = new Set(existing.interests.map((i) => i.toLowerCase()))

  const addedRoles = extracted.roles.filter((r) => !haveRoles.has(r.toLowerCase()))
  // Skills de LinkedIn se pliegan a intereses (señal de "en qué andás").
  const incomingInterests = [...extracted.interests, ...extracted.skills]
  const addedInterests = cleanTagList(incomingInterests).filter(
    (i) => !haveInterests.has(i.toLowerCase()),
  )

  const roles = cleanTagList([...existing.roles, ...extracted.roles])
  const interests = cleanTagList([...existing.interests, ...incomingInterests])

  const filled: CaptureProposalDiff['filled'] = []
  const name = fillIfEmpty(existing.fullName, extracted.fullName)
  if (name.filled) filled.push({ field: 'fullName', value: name.filled })
  // birthDate: rellena solo si no había una fecha; nunca pisa la existente.
  const birthDate = existing.birthDate ?? extracted.birthDate ?? null
  if (!existing.birthDate && extracted.birthDate) {
    filled.push({ field: 'birthDate', value: extracted.birthDate })
  }
  const loc = fillIfEmpty(existing.location, extracted.location)
  if (loc.filled) filled.push({ field: 'location', value: loc.filled })
  const bio = fillIfEmpty(existing.bio, extracted.bio)
  if (bio.filled) filled.push({ field: 'bio', value: bio.filled })
  const traj = fillIfEmpty(existing.trajectory, extracted.trajectory)
  if (traj.filled) filled.push({ field: 'trajectory', value: traj.filled })

  const proposed: IdentityProfile = {
    ...existing,
    fullName: name.value,
    birthDate,
    location: loc.value,
    bio: bio.value,
    trajectory: traj.value,
    roles,
    interests,
  }

  const hasChanges =
    addedRoles.length > 0 || addedInterests.length > 0 || filled.length > 0

  return { proposed, diff: { addedRoles, addedInterests, filled }, hasChanges }
}
