// SIR V2 — Paleta de colores del grafo + labels en español.

import type { GraphCategory } from './types'

export const CATEGORY_COLOR: Record<GraphCategory, string> = {
  familia:     '#ef4444', // rojo
  personal:    '#22c55e', // verde
  profesional: '#3b82f6', // azul
  networking:  '#94a3b8', // gris
  estrategico: '#a855f7', // violeta
  desarrollo:  '#f59e0b', // amber
  organizacion:'#14b8a6', // teal — nodo-empresa (hub), distinto de las personas
  episodio:    '#fb923c', // naranja — vínculo por un episodio compartido
  self:        '#f5f5f5', // foreground claro — el nodo "tu" se destaca por neutralidad
}

export const CATEGORY_LABEL: Record<GraphCategory, string> = {
  familia:     'Familia',
  personal:    'Personal',
  profesional: 'Profesional',
  networking:  'Networking',
  estrategico: 'Estratégico',
  desarrollo:  'Desarrollo',
  organizacion:'Organización',
  episodio:    'Episodio',
  self:        'Yo',
}

/** Categorias que aparecen en los tabs de filtro (sin 'self'). */
export const FILTERABLE_CATEGORIES: readonly GraphCategory[] = [
  'familia',
  'personal',
  'profesional',
  'networking',
  'estrategico',
  'desarrollo',
] as const
