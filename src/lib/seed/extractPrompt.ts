// SIR V2 — C1: extracción integrada de seed batch.
//
// Hasta ahora, para cargar personas Aaron tenía que ir a Claude.ai, pegar el
// PDF/relato, pedirle el JSON con el formato de data/seed-batches/README.md, y
// recién ahí pegarlo en /captura/batch. C1 mete ese paso ADENTRO de SIR: pega el
// texto crudo (relato, texto de un PDF, screenshot OCReado) y SIR arma el JSON.
//
// Este módulo es la capa PURA: arma el system prompt (con el schema + los enums
// vivos de plan.ts, para no desincronizarse) y parsea la respuesta. La llamada
// al modelo vive en /api/seed/extract. El JSON extraído NO se aplica solo —
// alimenta el textarea de /captura/batch para que Aaron lo revise, haga dry-run
// y recién ahí aplique (mismo flujo de confirmación de siempre).

import {
  VALID_RELATIONSHIPS,
  VALID_CATEGORIES,
  VALID_ENERGY_IMPACTS,
  VALID_CAPTURE_TYPES,
  VALID_CONFIDENCE,
  type SeedBatchInput,
} from './plan'

function list(set: Set<string>): string {
  return [...set].join(' | ')
}

/** System prompt para extraer un SeedBatchInput desde texto libre. Incluye los
 *  enums válidos así el modelo no inventa valores que después el planner descarta. */
export function buildSeedExtractSystemPrompt(): string {
  return `Eres SIR V2, el sistema personal de Aaron. Recibes TEXTO CRUDO sobre una o más personas
(un relato, el texto de un PDF/CV, un perfil de LinkedIn pegado, notas sueltas) y devuelves
EXCLUSIVAMENTE un JSON con el formato de "seed batch" de SIR. Sin prosa, sin fences.

Reglas:
- Extrae SOLO lo que el texto dice o implica con claridad. NO inventes datos (ni teléfonos,
  ni cargos, ni empresas que no aparezcan). Si un campo no está, omítelo.
- Una entrada por persona real mencionada. El usuario (Aaron) NO es una persona del batch:
  si el texto habla de la relación de alguien con Aaron, usa el sentinel "SELF" en person_links.
- "notes" es prosa corta con lo relevante que no entra en un campo. "observations" son hechos
  con fuente (ej. un perfil de LinkedIn → capture_type "linkedin_profile").
- Los enums DEBEN salir de estas listas (si dudas, elige el más conservador):
  - relationship: ${list(VALID_RELATIONSHIPS)}
  - category: ${list(VALID_CATEGORIES)}
  - energy_impact: ${list(VALID_ENERGY_IMPACTS)}
  - capture_type: ${list(VALID_CAPTURE_TYPES)}
  - confidence: ${list(VALID_CONFIDENCE)}
- importance_score y trust_level son enteros 0-10 (estima con criterio; ante la duda, 5).
- person_links conecta personas del batch entre sí o con "SELF". kind es el rol (ej. "colega",
  "jefe", "hermana"). _peso: "alto" | "medio" | "bajo". _context: texto corto opcional.

Estructura exacta:
{
  "_meta": { "source": "extraído de texto", "note": "…opcional…" },
  "people": [
    {
      "person": {
        "name": "…",              // requerido
        "alias": null,
        "relationship": "…",       // enum de arriba
        "category": "…",           // enum de arriba
        "title": null,
        "organization": null,
        "linkedin_url": null,
        "location": null,
        "gender": null,
        "importance_score": 5,
        "trust_level": 5,
        "energy_impact": "neutral",
        "notes": "…"
      },
      "tags": [],
      "org_link": { "name": "…", "role": "…" },   // opcional
      "observations": [
        { "capture_type": "…", "confidence": "medium", "data": { "…": "…" } }
      ]
    }
  ],
  "person_links": [
    { "person_a": "Nombre A", "person_b": "SELF", "kind": "colega", "_peso": "medio", "_context": "…" }
  ]
}

Devuelve el JSON empezando con { y terminando con }. Si el texto no menciona ninguna persona,
devuelve { "people": [] }.`
}

/** Quita fences ```json … ``` si el modelo los agrega. */
export function stripFences(raw: string): string {
  const t = raw.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}

/**
 * Parsea la respuesta del modelo a un SeedBatchInput. Tolerante: si viene con
 * fences los quita; si `people` no es array lo normaliza a []. Devuelve null si
 * no hay JSON parseable (el caller reintenta o reporta error).
 */
export function parseSeedExtractJson(raw: string): SeedBatchInput | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripFences(raw))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const o = parsed as Record<string, unknown>
  const people = Array.isArray(o.people) ? o.people : []
  const out: SeedBatchInput = { people: people as SeedBatchInput['people'] }
  if (o._meta && typeof o._meta === 'object') out._meta = o._meta as Record<string, unknown>
  if (Array.isArray(o.person_links)) out.person_links = o.person_links as SeedBatchInput['person_links']
  return out
}
