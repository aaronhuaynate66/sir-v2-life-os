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

/** Aceptación selectiva (16·M5, cara del persuadido): qué del mensaje ACEPTAR y
 *  qué RESISTIR. Base: PersuasionSurvey "Safeguarding" — balance resisting/accepting
 *  (Stengel-Eskin 2025) + anti-sycophancy (Sharma 2024) + resisting strategies
 *  (ResPer, Dutt 2021). Ni ceder para complacer, ni rechazar todo: discriminar. */
export interface DeepBalance {
  /** 'weigh' = hay algo legítimo que pesar; 'resist' = sostené tu posición; 'mixed'. */
  stance: 'weigh' | 'resist' | 'mixed'
  /** El punto LEGÍTIMO que sí vale considerar (argumento válido, emoción sincera, pedido justo). '' si no hay. */
  worthWeighing: string
  /** En qué NO cedas (la manipulación a resistir). '' si no hay. */
  holdGround: string
  /** Cómo aceptar selectivamente: sin complacer por evitar conflicto ni rechazar en bloque. */
  guidance: string
}

export interface DeepScanResult {
  findings: DeepFinding[]
  /** Lectura corta: qué está tratando de hacer el mensaje, sin alarmismo. */
  summary: string
  /** Veredicto de aceptación selectiva (defensa del persuadido). */
  balance?: DeepBalance
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

ACEPTACIÓN SELECTIVA (defensa del persuadido — lo más importante):
Además de nombrar técnicas, ayudá a Aaron a decidir qué ACEPTAR y qué RESISTIR. La ciencia dice
que ni ceder para complacer/evitar conflicto (sycophancy) ni rechazar todo en bloque: DISCRIMINAR.
- worthWeighing: separá el punto LEGÍTIMO si lo hay — un argumento válido, una emoción sincera, un
  pedido justo pueden convivir con técnicas manipuladoras. Reconocelo (que el otro use presión NO
  vuelve falso todo lo que dice). Si no hay nada legítimo, ''.
- holdGround: en qué NO ceder — la parte manipuladora que, aunque incomode, no obliga a nada.
- guidance: cómo responder aceptando selectivamente, ANCLADO en lo que Aaron realmente quiere (no en
  quedar bien ni en ganar la discusión). Una frase.
- stance: 'weigh' si hay algo real que considerar; 'resist' si es puro empuje sin fondo; 'mixed'.

Devolvé EXCLUSIVAMENTE un JSON (sin prosa, sin fences):
{
  "summary": "qué intenta hacer el mensaje, en 1-2 frases, sin alarmismo",
  "findings": [{"id":"<id del catálogo>","quote":"cita textual del mensaje","why":"por qué es esa técnica, 1 frase"}],
  "balance": {"stance":"weigh|resist|mixed","worthWeighing":"punto legítimo o ''","holdGround":"en qué no ceder o ''","guidance":"cómo aceptar selectivamente, 1 frase"}
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

  return { findings, summary: str(o.summary, 500), balance: parseBalance(o.balance) }
}

function parseBalance(v: unknown): DeepBalance | undefined {
  if (!v || typeof v !== 'object') return undefined
  const b = v as Record<string, unknown>
  const worthWeighing = str(b.worthWeighing, 400)
  const holdGround = str(b.holdGround, 400)
  const guidance = str(b.guidance, 400)
  // Sin ningún contenido útil → no mostramos veredicto.
  if (!worthWeighing && !holdGround && !guidance) return undefined
  const s = str(b.stance, 10)
  const stance: DeepBalance['stance'] = s === 'weigh' || s === 'resist' ? s : 'mixed'
  return { stance, worthWeighing, holdGround, guidance }
}
