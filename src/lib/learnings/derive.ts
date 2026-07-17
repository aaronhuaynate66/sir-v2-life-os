// SIR V2 — Derivación AUTOMÁTICA de learnings desde el sustrato (Fase 3d+).
//
// Hoy los learnings entran por: (a) carga manual (/yo), (b) relato-ingest (al
// escribir un relato). Falta la pata de "memoria que aprende sola": mirar lo
// que Aaron ya le dijo a SIR (sir_messages) y destilar lecciones DURABLES sin
// que él tenga que escribir un relato. Esto arma el prompt y parsea la salida;
// el cron `derive-learnings` hace la llamada + dedup + insert. PURO.
//
// Conservador por diseño: solo lecciones estables y no obvias, nunca inventar,
// no repetir lo ya sabido, y la confianza de lo auto-derivado se topa en 'medium'
// (es inferencia, no algo confirmado por Aaron).

import type { LearningKind, LearningConfidence } from './types'
import { normalizeLearningKind, normalizeLearningConfidence } from './types'

export interface DerivedLearning {
  text: string
  kind: LearningKind
  confidence: LearningConfidence
}

/** Máximo de learnings por corrida (evita spamear la base). */
export const MAX_DERIVED = 5

export const DERIVE_SYSTEM_PROMPT = `Eres el motor de memoria de SIR, el Life OS de Aaron. Tu trabajo: leer fragmentos de lo que Aaron le dijo a SIR y destilar LECCIONES DURABLES sobre él.

Escribe SIEMPRE en español del Perú (tuteo con "tú"); PROHIBIDO el voseo y los giros argentinos ("vos", "sos", "tenés", "querés", "mirá", "che", "dale").

Una lección sirve si es ESTABLE en el tiempo y ÚTIL para entenderlo o aconsejarlo mejor. Clasifica cada una:
- "preference": algo que prefiere o le gusta/disgusta (ej. "prefiere reuniones cortas por la mañana").
- "pattern": una tendencia de comportamiento (ej. "posterga las tareas administrativas").
- "principle": un valor o creencia que lo guía (ej. "prioriza la familia sobre el trabajo").
- "fact": un hecho estable sobre su vida (ej. "entrena taekwondo, apunta al mundial").

REGLAS DURAS:
- NO inventes ni infieras de más. Si no está sustentado en los fragmentos, no lo pongas.
- NO incluyas cosas efímeras (estados de ánimo del día, eventos puntuales, tareas sueltas).
- NO repitas lecciones que Aaron YA sabe (te paso la lista abajo); si un fragmento solo refuerza una existente, omitila.
- Escribe cada lección en tercera persona, una oración corta y concreta, en español.
- Devuelve SOLO un array JSON válido, sin markdown ni texto extra. Máximo ${MAX_DERIVED}.
- Si no hay nada nuevo y durable, devuelve exactamente: []

Formato: [{"text": "...", "kind": "preference|pattern|principle|fact", "confidence": "high|medium|low"}]`

/** Arma el input de usuario: fragmentos del sustrato + lo ya sabido. */
export function buildDeriveInput(signals: string[], existingTexts: string[]): string {
  const frags = (signals ?? [])
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .map((s) => `- ${s.slice(0, 500)}`)
    .join('\n')
  const known = (existingTexts ?? [])
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .map((s) => `- ${s}`)
    .join('\n')
  return [
    'FRAGMENTOS RECIENTES (lo que Aaron le dijo a SIR):',
    frags || '(ninguno)',
    '',
    'LECCIONES QUE AARON YA SABE (no las repitas):',
    known || '(ninguna)',
  ].join('\n')
}

function stripFences(raw: string): string {
  return (raw ?? '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

/**
 * Parsea la salida del modelo a learnings validados. Tolera fences y basura;
 * ante cualquier problema devuelve []. Topa la confianza en 'medium' (auto).
 */
export function parseDerivedLearnings(raw: string): DerivedLearning[] {
  let arr: unknown
  try {
    arr = JSON.parse(stripFences(raw))
  } catch {
    return []
  }
  if (!Array.isArray(arr)) return []
  const out: DerivedLearning[] = []
  const seen = new Set<string>()
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const text = typeof rec.text === 'string' ? rec.text.trim() : ''
    if (text.length < 4) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    // Auto-derivado: la confianza nunca sube de 'medium'.
    const conf = normalizeLearningConfidence(rec.confidence)
    const capped: LearningConfidence = conf === 'high' ? 'medium' : conf
    out.push({ text: text.slice(0, 300), kind: normalizeLearningKind(rec.kind), confidence: capped })
    if (out.length >= MAX_DERIVED) break
  }
  return out
}
