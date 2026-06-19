// SIR V2 — Ámbito de la persona (personal/colega/lead) + inferencia de default.
import type { Person, PersonAmbito, RelationshipType } from '@/types'

export const AMBITO_LABEL: Record<PersonAmbito, string> = {
  personal: 'Personal', colega: 'Colega', lead: 'Lead',
}

/** Default razonable cuando no está seteado, a partir del tipo de relación.
 *  Editable después por el usuario. */
export function inferAmbito(relationship: RelationshipType): PersonAmbito {
  switch (relationship) {
    case 'family': case 'friend': case 'romantic': case 'mentor': case 'mentee':
      return 'personal'
    case 'professional':
      return 'colega'
    case 'acquaintance':
    default:
      return 'lead'
  }
}

/** Ámbito efectivo: el explícito si existe, si no el inferido. */
export function effectiveAmbito(p: Pick<Person, 'ambito' | 'relationship'>): PersonAmbito {
  return p.ambito ?? inferAmbito(p.relationship)
}
