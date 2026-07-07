// SIR V2 — Notas relacionales por persona: qué genera FRICCIÓN, qué es
// FORTALEZA del vínculo y qué METAS COMPARTEN. Son anotaciones estratégicas
// que Aaron carga a mano en la ficha (no derivadas de IA) — inteligencia
// relacional cruda para que el contacto no sea genérico.
//
// STORAGE: `people.relational_notes` (jsonb, migration 0132), persistido vía
// updatePerson() del store — MISMO patrón que `people.special_dates` (ver
// FechasImportantes). NO se usan las columnas `relationships.tensions/…`
// (tabla semi-vestigial: el seed batch y la captura NO crean filas ahí, así
// que muchas personas no tendrían dónde colgarlas). `people` es la entidad
// confiable: toda persona tiene su fila.
//
// Este módulo es la capa PURA: parseo tolerante del jsonb + add/remove/normalize
// (trim, dedupe case-insensitive, caps). Sin React, sin store — testeable solo.

import type { RelationalNotes } from '@/types'

// Re-export para que consumidores (componente, tests) importen tipo + helpers
// desde un solo lugar.
export type { RelationalNotes }

/** Clave de cada lista — usada por la UI para iterar los tres editores. */
export type RelationalNoteKind = keyof RelationalNotes

/** Máximo de items por lista (no abrumar; son notas, no un log). */
export const MAX_NOTES_PER_KIND = 20

/** Máximo de caracteres por item (una idea corta, no un párrafo). */
export const MAX_NOTE_LENGTH = 140

/** Notas vacías canónicas (para empty state / default del jsonb). */
export const EMPTY_RELATIONAL_NOTES: RelationalNotes = {
  tensions: [],
  strengths: [],
  sharedGoals: [],
}

/** Metadata de cada lista para renderizar los tres editores en la ficha.
 *  El orden acá es el orden de arriba-abajo en la UI. */
export const RELATIONAL_NOTE_KINDS: ReadonlyArray<{
  kind: RelationalNoteKind
  label: string
  placeholder: string
  /** Frase corta bajo el título — qué registrar. */
  hint: string
}> = [
  {
    kind: 'tensions',
    label: 'Fricción',
    placeholder: 'Ej: se tensa cuando hablo de trabajo los findes',
    hint: 'Qué genera roce — para anticiparlo, no para evitarlo a ciegas.',
  },
  {
    kind: 'strengths',
    label: 'Fortalezas',
    placeholder: 'Ej: siempre responde rápido, muy leal',
    hint: 'Lo que sostiene el vínculo — para apoyarte en eso.',
  },
  {
    kind: 'sharedGoals',
    label: 'Metas en común',
    placeholder: 'Ej: los dos queremos correr la maratón de Lima',
    hint: 'Terreno compartido — para que el contacto tenga norte.',
  },
]

/** Normaliza un item: colapsa espacios, recorta al cap. Devuelve '' si queda vacío. */
export function normalizeNoteItem(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ')
  if (!t) return ''
  return t.length <= MAX_NOTE_LENGTH ? t : t.slice(0, MAX_NOTE_LENGTH).trimEnd()
}

/** ¿Ya existe este item en la lista (comparación case/acento-insensitive)? */
function sameItem(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return norm(a) === norm(b)
}

/** Parseo tolerante del jsonb `people.relational_notes`. Acepta null/undefined,
 *  objeto parcial, o basura → siempre devuelve una forma válida. Filtra items
 *  no-string, normaliza, dedupea y capa. Idempotente. */
export function parseRelationalNotes(raw: unknown): RelationalNotes {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_RELATIONAL_NOTES }
  }
  const o = raw as Record<string, unknown>
  const clean = (v: unknown): string[] => {
    if (!Array.isArray(v)) return []
    const out: string[] = []
    for (const el of v) {
      if (typeof el !== 'string') continue
      const item = normalizeNoteItem(el)
      if (!item) continue
      if (out.some((x) => sameItem(x, item))) continue
      out.push(item)
      if (out.length >= MAX_NOTES_PER_KIND) break
    }
    return out
  }
  return {
    tensions: clean(o.tensions),
    strengths: clean(o.strengths),
    sharedGoals: clean(o.sharedGoals),
  }
}

/** ¿Hay al menos un item en alguna lista? (para ocultar la sección si está vacía). */
export function hasAnyRelationalNote(n: RelationalNotes | undefined | null): boolean {
  if (!n) return false
  return n.tensions.length > 0 || n.strengths.length > 0 || n.sharedGoals.length > 0
}

/**
 * Agrega un item a una lista. Devuelve NUEVAS notas (inmutable). No-op si el
 * item queda vacío tras normalizar, si ya existe (case-insensitive), o si la
 * lista llegó al cap. Nunca muta la entrada.
 */
export function addNote(
  notes: RelationalNotes,
  kind: RelationalNoteKind,
  raw: string,
): RelationalNotes {
  const item = normalizeNoteItem(raw)
  if (!item) return notes
  const current = notes[kind]
  if (current.length >= MAX_NOTES_PER_KIND) return notes
  if (current.some((x) => sameItem(x, item))) return notes
  return { ...notes, [kind]: [...current, item] }
}

/**
 * Quita el item en `index` de una lista. Devuelve NUEVAS notas (inmutable).
 * No-op si el índice está fuera de rango.
 */
export function removeNote(
  notes: RelationalNotes,
  kind: RelationalNoteKind,
  index: number,
): RelationalNotes {
  const current = notes[kind]
  if (index < 0 || index >= current.length) return notes
  return { ...notes, [kind]: current.filter((_, i) => i !== index) }
}
