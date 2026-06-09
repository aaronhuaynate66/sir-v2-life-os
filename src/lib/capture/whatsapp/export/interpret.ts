// SIR V2 — Prompt + validación de la interpretación POR BLOQUE del export.
//
// El modelo recibe UN bloque de conversación (texto fiel, no OCR) + el nombre
// del contacto y devuelve un JSON ESTRICTO con: resumen observacional, topics,
// estados emocionales, tono/calidad del intercambio (1-5), fechas/eventos
// mencionados y hechos notables sobre la otra persona. Todo ATERRIZADO en lo
// que dice la charla — regla anti-invención dura.

import type { ChunkInterpretation, ExtractedDate } from './types'

/** System prompt para interpretar UN bloque. Recibe el nombre del contacto. */
export function getInterpretSystemPrompt(personName: string): string {
  const contact = personName.trim() || 'la otra persona'
  return `Sos un analista de conversaciones de WhatsApp. Recibís UN BLOQUE de una
conversación entre el usuario y su contacto "${contact}" (texto exportado,
fiel y exacto — NO es OCR, no hay nada que adivinar). Tu única tarea: devolver
UN JSON ESTRICTO (parseable con JSON.parse(), sin prosa, sin markdown fences).

Cada línea del bloque viene como "[YYYY-MM-DD HH:mm] Autor: contenido". Usá ESA
fecha para resolver fechas relativas (ver regla de fechas). "[media]" marca un
adjunto omitido (foto/audio/sticker/etc.) que NO podés ver: NO inventes su
contenido.

Schema EXACTO:

{
  "summary": "<2-4 frases en español, observacional, sin juicio: qué se habló>",
  "topics": ["snake_case_en_espanol", ...],
  "emotionalUser": "<snake_case combinable con '+'>" | null,
  "emotionalOther": "<snake_case>" | null,
  "toneScore": <1-5: 1=tenso/conflictivo, 3=neutral, 5=cálido/pleno>,
  "dates": [
    {
      "label": "<etiqueta corta, ej. 'Cumpleaños de Ana', 'Viaje a Cusco'>",
      "dateISO": "<YYYY-MM-DD o ISO con hora>" | null,
      "rawText": "<cita literal de la charla de donde sale>",
      "recurring": <true si es cumpleaños/aniversario; false si no>,
      "subject": "contact" | "self" | "tercero"
    }
  ],
  "events": ["<evento o plan notable mencionado, texto corto>", ...],
  "facts": ["<hecho notable sobre ${contact} dicho en la charla>", ...]
}

REGLAS:
1. ANTI-INVENCIÓN (dura): solo afirmá lo que está EN el texto del bloque. Si un
   dato no aparece, NO lo pongas. Listas vacías ([]) y null son respuestas
   válidas y preferibles a inventar.
2. summary: describí QUÉ pasó/se habló, no si estuvo bien o mal. Mencioná a
   ${contact} por su nombre. Máx ~400 caracteres.
3. topics: 2-6 tags en snake_case, EN ESPAÑOL. Ej: salud, trabajo, plan_finde,
   familia, resolucion_conflicto, saludo_diario, dinero, relacion, mascota, pago.
4. emotionalUser/emotionalOther: estado del INTERCAMBIO observable en el bloque
   (ej. affectionate_routine, tense_unresolved, seeking_support). null si no se
   puede inferir con base en el texto.
5. toneScore: leé el tono GENERAL del bloque. Discusión/reproches → 1-2;
   logístico/neutro → 3; afecto/risas/apoyo → 4-5.
6. dates: SOLO eventos REALES del vínculo con una cita textual clara (rawText).
   - ANCLÁ las fechas relativas al día del mensaje (está en el prefijo [YYYY-MM-DD]):
     "mañana" = día+1; "del 1 al 4" / "el sábado" → resolvé contra ESE mes/año, nunca
     asumas enero ni un año por defecto. Si no se puede resolver, dateISO=null + rawText.
   - NO combines fragmentos no relacionados para fabricar una fecha. Una cita, una fecha.
   - NO inventes el TIPO de evento si no se nombra (no asumas "bautizo", "boda" si la cita no lo dice).
   - PRIORIZÁ eventos notables o a futuro (cumpleaños, viajes, trámites, hitos). NO incluyas
     logística efímera pasada (almuerzos, "salimos 10:50", horarios puntuales de un día).
   - subject: de QUIÉN es el evento. "self" si es del usuario (ej. "tu cumpleaños",
     "te canto"), "tercero" si es de otra persona nombrada (ej. "el cumple de tata",
     "cumpleaños de Analia"), "contact" si es de ${contact}. Cumpleaños/aniversarios → recurring=true.
7. events: planes o hechos notables SIN fecha precisa (ej. "planean mudarse").
8. facts: hechos ESTABLES y DEFINITORIOS sobre ${contact} afirmados en la charla.
   PRIORIZÁ lo que define su vida/identidad por encima de la rutina repetida:
   - dónde vive y mudanzas grandes (ciudad/país; ej. "se mudó a Alicante", "vive en X").
   - etapa de vida: estudios (maestría, universidad), trabajo, profesión.
   - VÍNCULO con el usuario si se declara explícito (ej. "eres mi hermana" => es hermana del usuario).
   - hitos: viajes largos al exterior, cambios grandes de vida, salud relevante, estado civil.
   ATRIBUCIÓN (clave): no asumas propiedad. Si algo (mascota, casa, auto) es del USUARIO y
   ${contact} solo lo cuida/usa/comparte, decílo así (ej. "cuida al perro de Aaron cuando él viaja"),
   NUNCA como suyo ("tiene un perro"). Nada de suposiciones.
9. IGNORÁ contenido de DIFUSIÓN (no es del vínculo): noticias reenviadas (🚨,
   #HASHTAG, titulares, "Gobierno declara…"), flyers/invitaciones masivas a eventos
   (formato afiche con 🗓/🕒), cadenas y publicidad. No generes dates, facts ni
   events a partir de ellos; tampoco cuentan para el tono.

CRÍTICO: empezá con \`{\` y terminá con \`}\`. Solo JSON.`
}

/** Mensaje de usuario con el bloque a interpretar. */
export function buildInterpretUserMessage(chunkText: string): string {
  return `BLOQUE DE CONVERSACIÓN:\n\n${chunkText}`
}

// ─── Validación + sanitización defensiva del JSON del modelo ─────────

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

function strArray(v: unknown, cap: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of v) {
    const s = str(x)
    if (!s) continue
    const clipped = s.slice(0, maxLen)
    const key = clipped.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clipped)
    if (out.length >= cap) break
  }
  return out
}

function clampTone(v: unknown): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : 3
  return Math.max(1, Math.min(5, n))
}

function sanitizeDates(v: unknown): ExtractedDate[] {
  if (!Array.isArray(v)) return []
  const out: ExtractedDate[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as Record<string, unknown>
    const label = str(o.label)
    if (!label) continue
    let dateISO: string | null = null
    const di = str(o.dateISO)
    if (di) {
      const d = new Date(di.length === 10 ? `${di}T00:00:00Z` : di)
      if (!Number.isNaN(d.getTime())) dateISO = di
    }
    const subj = o.subject === 'self' || o.subject === 'tercero' || o.subject === 'contact' ? o.subject : undefined
    out.push({
      label: label.slice(0, 120),
      dateISO,
      rawText: (str(o.rawText) ?? '').slice(0, 240),
      recurring: o.recurring === true,
      subject: subj,
    })
    if (out.length >= 12) break
  }
  return out
}

/**
 * Valida + sanitiza el JSON crudo del modelo en un ChunkInterpretation seguro.
 * Tolerante: campos faltantes/ inválidos caen a defaults vacíos. Devuelve null
 * SOLO si la entrada no es un objeto (el caller reintenta/saltea el bloque).
 */
export function sanitizeChunkInterpretation(raw: unknown): ChunkInterpretation | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  return {
    summary: (str(o.summary) ?? '').slice(0, 600),
    topics: strArray(o.topics, 6, 40),
    emotionalUser: str(o.emotionalUser),
    emotionalOther: str(o.emotionalOther),
    toneScore: clampTone(o.toneScore),
    dates: sanitizeDates(o.dates),
    events: strArray(o.events, 8, 200),
    facts: strArray(o.facts, 8, 240),
  }
}
