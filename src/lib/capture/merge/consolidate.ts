// SIR V2 — Consolidación de VARIAS capturas de un MISMO perfil (lógica pura).
//
// Aaron sube varias capturas del mismo perfil (p. ej. 3 screenshots de
// distintas secciones de un LinkedIn). Cada imagen pasa por el pipeline
// existente (detect → preview Vision → assessExtraction) en el cliente, una
// llamada por imagen → NUNCA varias llamadas Vision en un solo request (respeta
// maxDuration de Vercel, cero riesgo de timeout). Acá UNIMOS lo extraído de
// todas en UN solo objeto, que luego se persiste como UNA sola observation vía
// el path `confirmed_data` ya existente de /api/capture/process.
//
// Todo PURO y testeable. Reglas de merge:
//   - strings  → el más COMPLETO (más largo, no vacío). Resuelve contradicciones
//                quedándose con el dato más rico.
//   - números  → el MÁXIMO no-nulo (los contadores —conexiones, seguidores—
//                suelen leerse parcialmente cortados; el mayor es el real).
//   - booleans → OR (si alguna captura vio "verificado/open to work", vale).
//   - listas   → UNIÓN deduplicada (cada sección aporta entradas distintas:
//                historial laboral, educación, seguidores en común).
//   - confidence → la MÁS ALTA (el consolidado es ≥ que la mejor captura sola).
//
// El detector puede equivocar el tipo en alguna imagen ruidosa: consolidamos
// SOLO las del tipo mayoritario; las de otro tipo se reportan como descartadas.

import type { CaptureType, Confidence } from '../observations/types'
import type { ExtractionVerdict } from '../legibility'
import type { LinkedInOrgRef } from '../linkedin/types'
import type { InstagramMutualFollowers } from '../instagram/mutual'

type Rec = Record<string, unknown>

const CONF_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

// ─── primitivos de merge ────────────────────────────────────────────

/** El string más completo (más largo, ya trimmeado por el sanitizer). null si
 *  ninguna captura aportó texto. */
function mostComplete(items: Rec[], key: string): string | null {
  let best: string | null = null
  for (const it of items) {
    const v = it[key]
    if (typeof v === 'string') {
      const t = v.trim()
      if (t.length > 0 && (best === null || t.length > best.length)) best = t
    }
  }
  return best
}

/** El primer string no-vacío en orden (para handles/URLs: no "el más largo"
 *  sino "el primero que se leyó bien"). */
function firstNonEmpty(items: Rec[], key: string): string | null {
  for (const it of items) {
    const v = it[key]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

/** El máximo no-nulo (contadores parcialmente cortados → el mayor es el real). */
function maxNumber(items: Rec[], key: string): number | null {
  let best: number | null = null
  for (const it of items) {
    const v = it[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      best = best === null ? v : Math.max(best, v)
    }
  }
  return best
}

/** OR: true si alguna captura lo vio true. */
function anyTrue(items: Rec[], key: string): boolean {
  return items.some((it) => it[key] === true)
}

/** La confianza más alta entre las capturas (el consolidado es al menos tan
 *  bueno como la mejor lectura individual). null si ninguna la trajo. */
export function mergeConfidence(items: Rec[]): Confidence | null {
  let best: Confidence | null = null
  for (const it of items) {
    const c = it.confidence
    if (typeof c === 'string' && c in CONF_RANK) {
      const conf = c as Confidence
      if (best === null || CONF_RANK[conf] > CONF_RANK[best]) best = conf
    }
  }
  return best
}

/** Concatena observaciones del modelo de varias capturas (dedup, recortado). */
function mergeRawObservations(items: Rec[]): string | null {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const it of items) {
    const v = it.rawObservations
    if (typeof v === 'string') {
      const t = v.trim()
      if (t.length > 0 && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase())
        parts.push(t)
      }
    }
  }
  if (parts.length === 0) return null
  return parts.join(' · ').slice(0, 240)
}

const MAX_HISTORY_ENTRIES = 12

/** Unión deduplicada de listas de orgRefs (historial laboral / educativo).
 *  Dedup por name+title (case-insensitive); en colisión, completa el dateRange
 *  faltante con el de una captura posterior. Clampa al máximo. */
function mergeOrgRefLists(items: Rec[], key: string): LinkedInOrgRef[] {
  const byKey = new Map<string, LinkedInOrgRef>()
  const order: string[] = []
  for (const it of items) {
    const list = it[key]
    if (!Array.isArray(list)) continue
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue
      const ref = raw as LinkedInOrgRef
      if (typeof ref.name !== 'string' || ref.name.trim().length === 0) continue
      const k = `${ref.name.trim().toLowerCase()}|${(ref.title ?? '').trim().toLowerCase()}`
      const existing = byKey.get(k)
      if (!existing) {
        byKey.set(k, {
          name: ref.name.trim(),
          title: ref.title ?? null,
          dateRange: ref.dateRange ?? null,
        })
        order.push(k)
      } else if (existing.dateRange == null && ref.dateRange != null) {
        // Completar el dato faltante con una captura que sí lo trajo.
        existing.dateRange = ref.dateRange
      }
    }
  }
  return order.slice(0, MAX_HISTORY_ENTRIES).map((k) => byKey.get(k)!)
}

// ─── mergers por tipo ───────────────────────────────────────────────

function mergeLinkedIn(items: Rec[]): Rec {
  const workHistory = mergeOrgRefLists(items, 'workHistory')
  const educationHistory = mergeOrgRefLists(items, 'educationHistory')
  return {
    fullName: mostComplete(items, 'fullName'),
    headline: mostComplete(items, 'headline'),
    location: mostComplete(items, 'location'),
    currentRole: mostComplete(items, 'currentRole'),
    currentCompany: mostComplete(items, 'currentCompany'),
    about: mostComplete(items, 'about'),
    latestExperience: workHistory[0] ?? null,
    latestEducation: educationHistory[0] ?? null,
    workHistory,
    educationHistory,
    profileUrl: firstNonEmpty(items, 'profileUrl'),
    connectionsCount: maxNumber(items, 'connectionsCount'),
    isOpenToWork: anyTrue(items, 'isOpenToWork'),
    hasProfilePhoto: anyTrue(items, 'hasProfilePhoto'),
    hasBannerImage: anyTrue(items, 'hasBannerImage'),
    // Solo consolidamos capturas legibles → al menos una es legible.
    imageLegible: true,
    confidence: mergeConfidence(items) ?? 'medium',
    rawObservations: mergeRawObservations(items),
  }
}

function mergeInstagramMutual(items: Rec[]): {
  text: string | null
  parsed: InstagramMutualFollowers | null
} {
  const named: string[] = []
  const seen = new Set<string>()
  let totalCount: number | null = null
  let bestText: string | null = null
  let bestTextCount = -1
  for (const it of items) {
    const m = it.mutualFollowers as InstagramMutualFollowers | null | undefined
    if (m && Array.isArray(m.named)) {
      for (const n of m.named) {
        const k = n.toLowerCase()
        if (!seen.has(k)) {
          seen.add(k)
          named.push(n)
        }
      }
      if (typeof m.totalCount === 'number') {
        totalCount = totalCount === null ? m.totalCount : Math.max(totalCount, m.totalCount)
      }
    }
    const t = it.mutualFollowersText
    if (typeof t === 'string' && t.trim().length > 0) {
      const c = m && typeof m.totalCount === 'number' ? m.totalCount : 0
      if (c > bestTextCount) {
        bestTextCount = c
        bestText = t.trim()
      }
    }
  }
  // totalCount nunca puede ser menor que los nombrados que sí conocemos.
  if (named.length > 0) {
    totalCount = totalCount === null ? named.length : Math.max(totalCount, named.length)
  }
  const parsed = named.length > 0 || totalCount !== null ? { named, totalCount } : null
  return { text: bestText, parsed }
}

function mergeInstagram(items: Rec[]): Rec {
  const mutual = mergeInstagramMutual(items)
  return {
    handle: firstNonEmpty(items, 'handle') ?? '',
    displayName: mostComplete(items, 'displayName'),
    bio: mostComplete(items, 'bio'),
    externalLink: firstNonEmpty(items, 'externalLink'),
    pronouns: firstNonEmpty(items, 'pronouns'),
    category: mostComplete(items, 'category'),
    postsCount: maxNumber(items, 'postsCount'),
    followersCount: maxNumber(items, 'followersCount'),
    followingCount: maxNumber(items, 'followingCount'),
    isVerified: anyTrue(items, 'isVerified'),
    isPrivate: anyTrue(items, 'isPrivate'),
    hasProfilePhoto: anyTrue(items, 'hasProfilePhoto'),
    mutualFollowersText: mutual.text,
    mutualFollowers: mutual.parsed,
    confidence: mergeConfidence(items) ?? 'medium',
    rawObservations: mergeRawObservations(items),
  }
}

/** Fallback genérico (WhatsApp y futuros tipos): por cada clave presente,
 *  union de arrays / string más largo / número máximo / OR de booleanos. La
 *  consolidación de primera clase es para perfiles (LinkedIn/Instagram); esto
 *  evita romper si llegan varias capturas de otro tipo. */
function mergeGeneric(items: Rec[]): Rec {
  const out: Rec = {}
  const keys = new Set<string>()
  for (const it of items) for (const k of Object.keys(it)) keys.add(k)
  for (const k of keys) {
    if (k === 'confidence') {
      out[k] = mergeConfidence(items) ?? 'medium'
      continue
    }
    if (k === 'rawObservations') {
      out[k] = mergeRawObservations(items)
      continue
    }
    const sample = items.find((it) => it[k] != null)?.[k]
    if (Array.isArray(sample)) {
      // Unión deduplicada (por valor para primitivos, por JSON para objetos).
      const seen = new Set<string>()
      const merged: unknown[] = []
      for (const it of items) {
        const v = it[k]
        if (!Array.isArray(v)) continue
        for (const el of v) {
          const key = typeof el === 'object' ? JSON.stringify(el) : String(el)
          if (!seen.has(key)) {
            seen.add(key)
            merged.push(el)
          }
        }
      }
      out[k] = merged
    } else if (typeof sample === 'number') {
      out[k] = maxNumber(items, k)
    } else if (typeof sample === 'boolean') {
      out[k] = anyTrue(items, k)
    } else if (typeof sample === 'string') {
      out[k] = mostComplete(items, k)
    } else {
      out[k] = sample ?? null
    }
  }
  return out
}

/**
 * Une lo extraído de varias capturas del MISMO tipo en un solo objeto + la
 * confianza consolidada. Con un solo item se comporta como identidad. NO muta
 * los items de entrada.
 */
export function mergeExtracted(
  captureType: CaptureType,
  items: Rec[],
): { extracted: Rec; confidence: Confidence | null } {
  const usable = items.filter((it) => it && typeof it === 'object')
  if (usable.length === 0) return { extracted: {}, confidence: null }

  let extracted: Rec
  switch (captureType) {
    case 'linkedin':
      extracted = mergeLinkedIn(usable)
      break
    case 'instagram':
      extracted = mergeInstagram(usable)
      break
    default:
      extracted = mergeGeneric(usable)
  }
  const confidence =
    typeof extracted.confidence === 'string' && extracted.confidence in CONF_RANK
      ? (extracted.confidence as Confidence)
      : mergeConfidence(usable)
  return { extracted, confidence }
}

// ─── selección de tipo + partición del lote ─────────────────────────

/**
 * El tipo consolidado del lote = el MÁS FRECUENTE entre las capturas usables
 * (desempate por primera aparición). Así una sola imagen ruidosa mal detectada
 * no arrastra a todo el lote. null si la lista está vacía.
 */
export function pickConsolidatedType(types: CaptureType[]): CaptureType | null {
  if (types.length === 0) return null
  const counts = new Map<CaptureType, number>()
  const firstSeen = new Map<CaptureType, number>()
  types.forEach((t, i) => {
    counts.set(t, (counts.get(t) ?? 0) + 1)
    if (!firstSeen.has(t)) firstSeen.set(t, i)
  })
  let winner = types[0]
  for (const [t, c] of counts) {
    const wc = counts.get(winner)!
    if (c > wc || (c === wc && firstSeen.get(t)! < firstSeen.get(winner)!)) {
      winner = t
    }
  }
  return winner
}

/** Una imagen del lote, ya pasada por detect + preview + assess en el cliente
 *  (esa parte es impura: vive en el componente). */
export interface BatchItemInput {
  /** Identificador estable para mapear de vuelta al File en el cliente. */
  id: string
  /** Resultado de planPersonCapture(type).kind. */
  plan: 'link' | 'scale' | 'unsupported'
  captureType: CaptureType
  extracted?: Rec | null
  confidence?: Confidence | null
  /** Veredicto de assessExtraction (legibilidad por imagen). */
  verdict?: ExtractionVerdict | null
  /** Si detect/preview falló para esta imagen. */
  error?: string | null
}

export interface ConsolidatedBatch {
  /** Tipo elegido para el lote (mayoría). null si nada usable. */
  consolidatedType: CaptureType | null
  /** Extraído consolidado del tipo elegido. null si nada usable. */
  extracted: Rec | null
  confidence: Confidence | null
  /** Ids de las capturas que entraron en el merge. */
  usedIds: string[]
  /** Ids ilegibles (verdict='unreadable') — se omiten pero se avisan. */
  illegibleIds: string[]
  /** Ids de báscula (van a salud, no al perfil). */
  scaleIds: string[]
  /** Ids sin extractor asociable a persona. */
  unsupportedIds: string[]
  /** Ids usables pero de OTRO tipo distinto al consolidado (descartados). */
  mismatchIds: string[]
  /** Ids cuyo detect/preview falló. */
  erroredIds: string[]
}

/**
 * Particiona el lote y consolida las capturas usables del tipo mayoritario.
 *
 * "Usable" = plan 'link' + veredicto distinto de 'unreadable'. Las ilegibles se
 * apartan (se avisa, no se procesan), igual que báscula / no-soportadas / con
 * error. Pura: el cliente arma los BatchItemInput (parte impura: Vision) y
 * renderiza el resultado.
 */
export function consolidateBatch(items: BatchItemInput[]): ConsolidatedBatch {
  const illegibleIds: string[] = []
  const scaleIds: string[] = []
  const unsupportedIds: string[] = []
  const erroredIds: string[] = []
  const candidates: { id: string; captureType: CaptureType; extracted: Rec }[] = []

  for (const it of items) {
    if (it.error) {
      erroredIds.push(it.id)
      continue
    }
    if (it.plan === 'scale') {
      scaleIds.push(it.id)
      continue
    }
    if (it.plan === 'unsupported') {
      unsupportedIds.push(it.id)
      continue
    }
    // plan 'link'
    if (it.verdict === 'unreadable' || !it.extracted) {
      illegibleIds.push(it.id)
      continue
    }
    candidates.push({ id: it.id, captureType: it.captureType, extracted: it.extracted })
  }

  if (candidates.length === 0) {
    return {
      consolidatedType: null,
      extracted: null,
      confidence: null,
      usedIds: [],
      illegibleIds,
      scaleIds,
      unsupportedIds,
      mismatchIds: [],
      erroredIds,
    }
  }

  const consolidatedType = pickConsolidatedType(candidates.map((c) => c.captureType))!
  const used = candidates.filter((c) => c.captureType === consolidatedType)
  const mismatchIds = candidates.filter((c) => c.captureType !== consolidatedType).map((c) => c.id)

  const { extracted, confidence } = mergeExtracted(
    consolidatedType,
    used.map((c) => c.extracted),
  )

  return {
    consolidatedType,
    extracted,
    confidence,
    usedIds: used.map((c) => c.id),
    illegibleIds,
    scaleIds,
    unsupportedIds,
    mismatchIds,
    erroredIds,
  }
}
