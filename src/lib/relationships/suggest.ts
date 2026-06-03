// SIR V2 — Motor de SUGERENCIAS de familia (puro, nunca auto-aplica).
//
// Dos fuentes, una misma UI de aceptar/descartar:
//
//   1) INFERENCIA transitiva sobre person_links. Si B es <k1> de A y C es <k2>
//      de B, proponemos "C es compose(k1,k2) de A" (ver composeKinds). Ej.:
//      Nicolle es tu hermana y María es madre de Nicolle ⇒ "María también es
//      tu madre". Solo proponemos; Aaron acepta o descarta.
//
//   2) RECONCILIACIÓN best-effort del texto libre de familia en person.notes
//      ("MADRE: maria") contra personas que YA existen, por match de nombre. Si
//      es ambiguo, devolvemos varios candidatos (la UI decide). Nunca borra el
//      texto: solo sugiere el vínculo estructurado.
//
// Todo es determinístico y testeable. La UI traduce un Suggestion aceptado a
// addPersonLink / addPerson.

import type { FamilyKind, Person, PersonLink } from '@/types'
import { composeKinds } from './family'
import { matchStrength } from './nameMatch'

/** Sugerencia de vincular subject → un familiar por inferencia transitiva. */
export interface InferenceSuggestion {
  source: 'inference'
  /** Clave estable para recordar descartes (no depende del orden). */
  key: string
  subjectId: string
  /** Persona a vincular (ya existe en el grafo). */
  targetId: string
  kind: FamilyKind
  /** Persona puente que justifica la inferencia. */
  viaId: string
}

/** Un candidato de reconciliación (persona existente que podría ser la del texto). */
export interface ReconcileCandidate {
  personId: string
  strength: number
}

/** Sugerencia de reconciliar un texto libre de familia con una persona. */
export interface ReconcileSuggestion {
  source: 'reconciliation'
  key: string
  subjectId: string
  kind: FamilyKind
  /** El nombre tal cual aparece en las notas ("maria"). */
  rawName: string
  /** Personas existentes ordenadas por fuerza de match (desc). Puede estar vacío. */
  candidates: ReconcileCandidate[]
}

export type FamilySuggestion = InferenceSuggestion | ReconcileSuggestion

/** Set de pares ya vinculados (cualquier sentido) para no re-sugerir. */
function existingPairKeys(links: PersonLink[]): Set<string> {
  const s = new Set<string>()
  for (const l of links) {
    s.add(`${l.personAId}|${l.personBId}`)
    s.add(`${l.personBId}|${l.personAId}`)
  }
  return s
}

/**
 * Inferencia transitiva para el sujeto `subjectId`. Recorre los vínculos
 * salientes del sujeto (B es k1 del sujeto) y, por cada uno, los vínculos
 * salientes de B (C es k2 de B), componiendo k1∘k2. Excluye al propio sujeto,
 * los pares ya vinculados y los duplicados.
 */
export function inferFamilyLinks(
  subjectId: string,
  links: PersonLink[],
): InferenceSuggestion[] {
  const existing = existingPairKeys(links)
  const fromSubject = links.filter((l) => l.personAId === subjectId)
  const out: InferenceSuggestion[] = []
  const seen = new Set<string>()

  for (const step1 of fromSubject) {
    const bId = step1.personBId
    const fromB = links.filter((l) => l.personAId === bId)
    for (const step2 of fromB) {
      const cId = step2.personBId
      if (cId === subjectId || cId === bId) continue
      const kind = composeKinds(step1.kind, step2.kind)
      if (!kind) continue
      if (existing.has(`${subjectId}|${cId}`)) continue
      const key = `inf:${subjectId}:${cId}:${kind}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ source: 'inference', key, subjectId, targetId: cId, kind, viaId: bId })
    }
  }
  return out
}

/** Palabras de parentesco reconocidas en notas → FamilyKind canónico. */
const NOTE_LABEL_TO_KIND: Record<string, FamilyKind> = {
  madre: 'madre',
  mama: 'madre',
  padre: 'padre',
  papa: 'padre',
  hija: 'hija',
  hijo: 'hijo',
  hermana: 'hermana',
  hermano: 'hermano',
  pareja: 'pareja',
  esposa: 'pareja',
  esposo: 'pareja',
  novia: 'pareja',
  novio: 'pareja',
  conyuge: 'pareja',
  abuela: 'abuela',
  abuelo: 'abuelo',
  tia: 'tia',
  tio: 'tio',
  prima: 'prima',
  primo: 'primo',
  amiga: 'amiga',
  amigo: 'amigo',
}

const NOTE_FAMILY_RE =
  /(madre|mam[áa]|padre|pap[áa]|hija|hijo|hermana|hermano|pareja|esposa|esposo|novia|novio|c[óo]nyuge|abuela|abuelo|t[íi]a|t[íi]o|prima|primo|amiga|amigo)\s*[:\-–]\s*([^\n,;]+)/gi

/** Normaliza la etiqueta del texto (sin tilde) a su key del mapa. */
function labelKey(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/** Parsea menciones "ETIQUETA: nombre" del texto libre. Requiere separador
 *  explícito (: ó -) para no confundir prosa ("su madre vive en…"). */
export function parseFamilyMentions(notes: string | undefined | null): { kind: FamilyKind; rawName: string }[] {
  if (!notes) return []
  const out: { kind: FamilyKind; rawName: string }[] = []
  for (const m of notes.matchAll(NOTE_FAMILY_RE)) {
    const kind = NOTE_LABEL_TO_KIND[labelKey(m[1])]
    const rawName = m[2]?.trim()
    if (!kind || !rawName) continue
    out.push({ kind, rawName })
  }
  return out
}

/**
 * Reconciliación best-effort de la familia escrita en las notas del sujeto
 * contra las personas existentes. Devuelve una sugerencia por mención, con los
 * candidatos ordenados por fuerza de match. Excluye al propio sujeto y a los
 * pares ya vinculados (esos ya están resueltos).
 */
export function reconcileFamilyFromNotes(
  subject: Person,
  people: Person[],
  links: PersonLink[],
): ReconcileSuggestion[] {
  const existing = existingPairKeys(links)
  const mentions = parseFamilyMentions(subject.notes)
  const out: ReconcileSuggestion[] = []
  const seen = new Set<string>()

  for (const { kind, rawName } of mentions) {
    const candidates: ReconcileCandidate[] = []
    for (const p of people) {
      if (p.id === subject.id) continue
      if (existing.has(`${subject.id}|${p.id}`)) continue
      const strength = matchStrength(rawName, p.name)
      if (strength >= 0.6) candidates.push({ personId: p.id, strength })
    }
    candidates.sort((a, b) => b.strength - a.strength)

    const key = `rec:${subject.id}:${kind}:${labelKey(rawName)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ source: 'reconciliation', key, subjectId: subject.id, kind, rawName, candidates })
  }
  return out
}
