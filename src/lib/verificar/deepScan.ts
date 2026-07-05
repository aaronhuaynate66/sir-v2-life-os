// SIR V2 — Deep-scan de manipulación con IA (16·M3): cubre las 23 técnicas del
// catálogo, incluidas las SEMÁNTICAS que el regex no puede (hombre de paja, pista
// falsa, sobresimplificación, etc.). Capa PURA: arma el prompt y parsea. La
// llamada al modelo vive en /api/verificar/deep. A diferencia del scan instantáneo
// (que corre en el navegador y NO manda el texto a ningún lado), este modo SÍ
// manda el texto al modelo — la UI lo avisa y es opt-in.

import { TECHNIQUES, TECHNIQUE_BY_ID, CATEGORY_LABEL, type TechniqueCategory } from '@/engines/manipulation/techniques'

export interface DeepFinding {
  /** id del catálogo de técnicas. */
  id: string
  label: string
  category: TechniqueCategory
  /** Cita textual del mensaje donde aparece. */
  quote: string
  /** Por qué cuenta como esa técnica (1 frase). */
  why: string
}

export interface DeepScanResult {
  findings: DeepFinding[]
  /** Lectura corta: qué está tratando de hacer el mensaje, sin alarmismo. */
  summary: string
}

export const DEEP_SCAN_SYSTEM_PROMPT = `Sos el módulo de DEFENSA de SIR. Aaron pega un mensaje que le llegó (un chat, un mail, un
posteo, un pedido) y vos identificás qué TÉCNICAS de persuasión/propaganda tiene, para que él
las vea y no se las coman. Es defensa y alfabetización: nombrar la movida, no acusar a nadie.

REGLAS DURAS:
- Marcá SOLO técnicas realmente presentes, con una CITA textual del mensaje como evidencia. Si el
  mensaje es sano/directo, devolvé findings vacío y decilo en summary. NO inventes manipulación
  donde no la hay: un pedido claro o una emoción sincera NO son técnicas.
- Usá EXCLUSIVAMENTE las técnicas del catálogo provisto (por su id). No inventes categorías.
- No moralices ni alarmes. Tono de aliado que te enseña a leer. summary en 1-2 frases.
- Una misma frase puede tener más de una técnica; no fuerces. Máximo ~8 findings.

Devolvé EXCLUSIVAMENTE un JSON (sin prosa, sin fences):
{
  "summary": "qué intenta hacer el mensaje, en 1-2 frases, sin alarmismo",
  "findings": [{"id":"<id del catálogo>","quote":"cita textual del mensaje","why":"por qué es esa técnica, 1 frase"}]
}
Empezá con { y terminá con }.`

/** Bloque con el catálogo de técnicas para el prompt (id · nombre · qué es). */
export function techniquesForPrompt(): string {
  const byCat = new Map<TechniqueCategory, string[]>()
  for (const t of TECHNIQUES) {
    const arr = byCat.get(t.category) ?? []
    arr.push(`- ${t.id} (${t.label}): ${t.definition}`)
    byCat.set(t.category, arr)
  }
  const lines: string[] = ['CATÁLOGO DE TÉCNICAS (usá estos id):']
  for (const [cat, items] of byCat) {
    lines.push('', CATEGORY_LABEL[cat] + ':')
    lines.push(...items)
  }
  return lines.join('\n')
}

export function buildDeepScanUserContent(message: string): string {
  return [
    techniquesForPrompt(),
    '',
    'MENSAJE A ANALIZAR (delimitado por <<< >>>):',
    '<<<',
    message.trim().slice(0, 6000),
    '>>>',
  ].join('\n')
}

function stripFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}
function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** Parsea la respuesta del modelo a DeepScanResult. Filtra ids fuera del catálogo. */
export function parseDeepScan(raw: string): DeepScanResult | null {
  let parsed: unknown
  try { parsed = JSON.parse(stripFences(raw)) } catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const o = parsed as Record<string, unknown>

  const findings: DeepFinding[] = Array.isArray(o.findings)
    ? o.findings
        .map((f) => {
          const x = (f ?? {}) as Record<string, unknown>
          const id = str(x.id, 60)
          const def = TECHNIQUE_BY_ID[id]
          if (!def) return null
          const quote = str(x.quote, 400)
          if (!quote) return null
          return { id, label: def.label, category: def.category, quote, why: str(x.why, 300) }
        })
        .filter((f): f is DeepFinding => f !== null)
        .slice(0, 10)
    : []

  return { findings, summary: str(o.summary, 500) }
}
