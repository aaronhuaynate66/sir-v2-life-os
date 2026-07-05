// SIR V2 — Vínculos profesionales/sociales persona↔persona (0128).
//
// Los valores de rol y sus etiquetas para el capturador que desbloquea 15·7.
// Viven en la misma tabla person_links que familia, distinguidos por `category`.
// El label INVERSO se muestra en la ficha del otro extremo (jefe↔reporte, etc.).

import type { ProfessionalKind, LinkCategory } from '@/types'

export const PRO_KIND_LABEL: Record<ProfessionalKind, string> = {
  colega: 'Colega',
  jefe: 'Jefe/a',
  exjefe: 'Ex jefe/a',
  reporte: 'Le reporta',
  mentor: 'Mentor/a',
  mentoreado: 'Mentoreado/a',
  cliente: 'Cliente',
  proveedor: 'Proveedor',
  socio: 'Socio/a',
  conocido: 'Conocido/a',
  contacto: 'Contacto',
}

/** Rol inverso: cómo se lee A desde la ficha de B si "B es <kind> de A". */
const INVERSE: Record<ProfessionalKind, ProfessionalKind> = {
  colega: 'colega',
  socio: 'socio',
  conocido: 'conocido',
  contacto: 'contacto',
  jefe: 'reporte',
  reporte: 'jefe',
  exjefe: 'reporte',
  mentor: 'mentoreado',
  mentoreado: 'mentor',
  cliente: 'proveedor',
  proveedor: 'cliente',
}

export function inverseProKindLabel(kind: ProfessionalKind): string {
  return PRO_KIND_LABEL[INVERSE[kind]] ?? PRO_KIND_LABEL[kind] ?? kind
}

/** Opciones para el selector, agrupadas por categoría. */
export const PRO_KIND_OPTIONS: { value: ProfessionalKind; label: string; category: LinkCategory }[] = [
  { value: 'colega', label: 'Colega', category: 'profesional' },
  { value: 'jefe', label: 'Es jefe/a de', category: 'profesional' },
  { value: 'reporte', label: 'Le reporta a', category: 'profesional' },
  { value: 'exjefe', label: 'Ex jefe/a', category: 'profesional' },
  { value: 'mentor', label: 'Mentor/a de', category: 'profesional' },
  { value: 'mentoreado', label: 'Mentoreado/a por', category: 'profesional' },
  { value: 'cliente', label: 'Cliente de', category: 'profesional' },
  { value: 'proveedor', label: 'Proveedor de', category: 'profesional' },
  { value: 'socio', label: 'Socio/a', category: 'profesional' },
  { value: 'conocido', label: 'Conocido/a', category: 'social' },
  { value: 'contacto', label: 'Contacto', category: 'social' },
]

export function categoryForProKind(kind: ProfessionalKind): LinkCategory {
  return PRO_KIND_OPTIONS.find((o) => o.value === kind)?.category ?? 'profesional'
}
