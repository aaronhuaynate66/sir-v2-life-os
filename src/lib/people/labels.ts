// SIR V2 — Etiquetas en español para los enums de relaciones.
//
// Fuente única de verdad para el texto user-facing de los enums de personas
// (tipo de vínculo, círculo, energía, estado, urgencia de alerta). Los valores
// almacenados en la BD y los identificadores del enum NO cambian — esto sólo
// traduce el display label. Importar desde acá en vez de repetir maps sueltos
// por pantalla, así no vuelven a aparecer strings crudos en inglés en la UI.

import type {
  RelationshipType,
  PersonCategory,
  EnergyImpact,
  RelationshipStatus,
} from '@/types'

export const RELATIONSHIP_TYPE_LABEL: Record<RelationshipType, string> = {
  family: 'Familia',
  friend: 'Amigo/a',
  romantic: 'Pareja',
  professional: 'Profesional',
  mentor: 'Mentor/a',
  mentee: 'Aprendiz',
  acquaintance: 'Conocido/a',
}

export const PERSON_CATEGORY_LABEL: Record<PersonCategory, string> = {
  inner_circle: 'Círculo íntimo',
  close: 'Cercano',
  network: 'Red',
  peripheral: 'Periférico',
}

export const ENERGY_IMPACT_LABEL: Record<EnergyImpact, string> = {
  energizing: 'Energizante',
  neutral: 'Neutral',
  draining: 'Drenante',
}

export const RELATIONSHIP_STATUS_LABEL: Record<RelationshipStatus, string> = {
  active: 'Activa',
  dormant: 'Inactiva',
  strained: 'Tensa',
  ended: 'Terminada',
}

/** Urgencia de una alerta relacional (engines/relationship → RelationshipAlert). */
export const ALERT_URGENCY_LABEL: Record<'immediate' | 'soon' | 'monitor', string> = {
  immediate: 'Inmediata',
  soon: 'Pronto',
  monitor: 'Monitorear',
}

// Helpers con fallback al valor crudo, por si la BD trae un enum nuevo aún sin
// traducir (no rompe la UI; muestra el código en vez de undefined).
export const relationshipTypeLabel = (v: RelationshipType): string =>
  RELATIONSHIP_TYPE_LABEL[v] ?? v

export const personCategoryLabel = (v: PersonCategory): string =>
  PERSON_CATEGORY_LABEL[v] ?? v

export const energyImpactLabel = (v: EnergyImpact): string =>
  ENERGY_IMPACT_LABEL[v] ?? v

export const relationshipStatusLabel = (v: RelationshipStatus): string =>
  RELATIONSHIP_STATUS_LABEL[v] ?? v

export const alertUrgencyLabel = (v: 'immediate' | 'soon' | 'monitor'): string =>
  ALERT_URGENCY_LABEL[v] ?? v
