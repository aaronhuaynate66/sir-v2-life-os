// SIR V2 — Intake inteligente: la IA cruza señales de varios archivos (LinkedIn,
// WhatsApp, Instagram) y PROPONE quién es la persona y qué tipo de relación es.
// PURO + testeable (prompt + parse + validación de enums). NO persiste nada: la
// propuesta se muestra para que el usuario confirme/edite.

import type { RelationshipType, PersonCategory } from '@/types'

const RELATIONSHIPS: RelationshipType[] = [
  'family',
  'friend',
  'romantic',
  'professional',
  'mentor',
  'mentee',
]
const CATEGORIES: PersonCategory[] = ['inner_circle', 'close', 'network', 'peripheral']

export interface IntakeSignals {
  linkedin?: { fullName?: string; headline?: string; company?: string } | null
  instagram?: { displayName?: string; handle?: string } | null
  whatsapp?: { name?: string; participants?: string[]; excerpt?: string } | null
}

export interface IntakeSuggestion {
  name: string
  organization: string
  relationship: RelationshipType
  category: PersonCategory
  reason: string
}

export const INTAKE_SYSTEM_PROMPT = `Sos un asistente que, a partir de señales extraídas de archivos (perfil de LinkedIn, export de WhatsApp, perfil de Instagram), PROPONE la identidad de una persona y el tipo de relación con el usuario.

Devolvé EXCLUSIVAMENTE un objeto JSON válido, sin texto alrededor:
{"name": string, "organization": string, "relationship": string, "category": string, "reason": string}

Reglas:
- "name": el nombre real más completo y confiable (preferí el de LinkedIn por sobre el del archivo de WhatsApp). Sin emojis ni apodos de agenda.
- "organization": empresa/empleador actual si aparece; "" si no.
- "relationship": UNO de: family, friend, romantic, professional, mentor, mentee. Si hay LinkedIn y trato laboral → professional. Familiar solo si las señales lo indican.
- "category": UNO de: inner_circle, close, network, peripheral. Por defecto network salvo señales de cercanía.
- "reason": 1 frase corta en español explicando en qué te basaste.
- SOLO usá lo que está en las señales. NO inventes nombres, empresas ni vínculos. Si algo no se sabe, dejalo vacío o usá los defaults (professional/network).`

export function buildIntakeInput(signals: IntakeSignals): string {
  const parts: string[] = []
  if (signals.linkedin) {
    const l = signals.linkedin
    parts.push(
      `LinkedIn:\n- nombre: ${l.fullName ?? '(s/d)'}\n- titular: ${l.headline ?? '(s/d)'}\n- empresa: ${l.company ?? '(s/d)'}`,
    )
  }
  if (signals.instagram) {
    const i = signals.instagram
    parts.push(`Instagram:\n- nombre: ${i.displayName ?? '(s/d)'}\n- handle: ${i.handle ?? '(s/d)'}`)
  }
  if (signals.whatsapp) {
    const w = signals.whatsapp
    parts.push(
      `WhatsApp:\n- nombre del chat: ${w.name ?? '(s/d)'}\n- participantes: ${(w.participants ?? []).join(', ') || '(s/d)'}\n- extracto: ${(w.excerpt ?? '').slice(0, 800) || '(s/d)'}`,
    )
  }
  if (parts.length === 0) parts.push('(sin señales)')
  return `Señales:\n\n${parts.join('\n\n')}\n\nDevolvé el JSON.`
}

function pickEnum<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  return typeof v === 'string' && (allowed as string[]).includes(v) ? (v as T) : fallback
}

function cap(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** Parsea la respuesta del modelo (JSON tolerante) → propuesta validada. null si
 *  no hay nombre utilizable. */
export function parseIntakeSuggestion(raw: string): IntakeSuggestion | null {
  if (!raw) return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  const name = cap(obj.name, 160)
  if (name.length < 2) return null
  return {
    name,
    organization: cap(obj.organization, 160),
    relationship: pickEnum(obj.relationship, RELATIONSHIPS, 'professional'),
    category: pickEnum(obj.category, CATEGORIES, 'network'),
    reason: cap(obj.reason, 300),
  }
}
