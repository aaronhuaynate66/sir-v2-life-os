// SIR V2 — Madurez del perfil de una persona (insignia). PURO.
//
// Slice del diferenciador "recibos por dato" (#800): además de mostrar la
// procedencia de CADA memoria, resume DE UN VISTAZO qué tan bien conoce SIR a la
// persona y SOBRE QUÉ BASE. No es cantidad por cantidad: 20 memorias inferidas
// pesan menos que 8 que salen de sus chats o que anotaste tú. Así Aaron sabe
// cuánto puede confiar en lo que SIR dice de alguien — y qué hacer para afianzarlo.
//
// Determinístico y sin I/O → testeable (ver maturity.test.ts).

import type { Memory } from '@/types'
import { memoryProvenance } from './provenance'

export type MaturityLevel = 'naciente' | 'en_formacion' | 'solido' | 'profundo'

export interface ProfileMaturity {
  level: MaturityLevel
  /** Etiqueta humana ('Perfil sólido'…). */
  label: string
  /** Total de memorias (visibles) sobre las que se calcula. */
  count: number
  /** Desglose de la base. */
  fromChat: number
  fromManual: number
  fromInferred: number
  /** Origen sin registrar (legado). */
  fromUnknown: number
  /** Proporción fundada = (chat + manual) / count. 0 si no hay memorias. */
  groundedShare: number
  /** Frase de la base ("8 de tu chat · 3 que anotaste · 2 inferidas"). */
  basis: string
  /** Qué haría madurar el perfil, o '' si ya es profundo. */
  nextStep: string
}

const LABEL: Record<MaturityLevel, string> = {
  naciente: 'Perfil naciente',
  en_formacion: 'Perfil en formación',
  solido: 'Perfil sólido',
  profundo: 'Perfil profundo',
}

/** El nivel: combina volumen con cuán FUNDADO está (chat/manual sobre inferido). */
function levelOf(count: number, groundedShare: number): MaturityLevel {
  if (count < 4) return 'naciente'
  if (count < 10) return 'en_formacion'
  // 10+: el volumen ya está; ahora manda la base.
  if (count >= 20 && groundedShare >= 0.5) return 'profundo'
  if (groundedShare >= 0.4) return 'solido'
  return 'en_formacion' // muchos datos pero poco fundados → no sube todavía
}

function buildBasis(chat: number, manual: number, inferred: number, unknown: number): string {
  const parts: string[] = []
  if (chat) parts.push(`${chat} de tu chat`)
  if (manual) parts.push(`${manual} que anotaste`)
  if (inferred) parts.push(`${inferred} inferida${inferred === 1 ? '' : 's'}`)
  if (unknown) parts.push(`${unknown} sin origen`)
  return parts.join(' · ')
}

function nextStepFor(level: MaturityLevel, inferredHeavy: boolean): string {
  switch (level) {
    case 'naciente':
      return 'Deriva memorias desde sus conversaciones o anota lo que sepas de esta persona.'
    case 'en_formacion':
      return inferredHeavy
        ? 'SIR se apoya mucho en inferencias — confirma o anota datos para afianzarlo.'
        : 'Suma más contexto (chats, notas) para que SIR la conozca mejor.'
    case 'solido':
      return 'Bien fundado. Anota lo que cambie para mantenerlo fresco.'
    case 'profundo':
      return ''
  }
}

/**
 * Deriva la madurez del perfil de una persona a partir de sus memorias VISIBLES.
 * `count === 0` → naciente con base vacía (la UI puede optar por no mostrarlo). PURO.
 */
export function profileMaturity(memories: Pick<Memory, 'source'>[]): ProfileMaturity {
  let chat = 0, manual = 0, inferred = 0, unknown = 0
  for (const m of memories) {
    switch (m.source) {
      case 'whatsapp_capture': chat++; break
      case 'manual': manual++; break
      case 'inferred': inferred++; break
      default: {
        // Sin source registrado → 'unknown' salvo que memoryProvenance lo clasifique
        // (hoy default = unknown). Mantiene una sola fuente de verdad de confianza.
        const conf = memoryProvenance(m.source).confidence
        if (conf === 'high') chat++
        else if (conf === 'certain') manual++
        else if (conf === 'medium') inferred++
        else unknown++
      }
    }
  }
  const count = memories.length
  const grounded = chat + manual
  const groundedShare = count > 0 ? grounded / count : 0
  const level = levelOf(count, groundedShare)
  const inferredHeavy = count > 0 && (inferred + unknown) / count > 0.5
  return {
    level,
    label: LABEL[level],
    count,
    fromChat: chat,
    fromManual: manual,
    fromInferred: inferred,
    fromUnknown: unknown,
    groundedShare,
    basis: buildBasis(chat, manual, inferred, unknown),
    nextStep: nextStepFor(level, inferredHeavy),
  }
}
