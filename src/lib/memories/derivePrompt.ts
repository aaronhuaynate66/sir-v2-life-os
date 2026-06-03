// SIR V2 — Prompt + parser de la síntesis de memorias desde observations.
//
// El route arma el input desde ObservationDigest[] (+ contexto de objetivos
// vinculados) y le pide a Anthropic una lista de memorias notables en JSON. El
// parser es PURO y tolerante (extrae el primer bloque JSON aunque venga con
// texto alrededor) → testeable.
//
// MEJORAS (caso Dayana, 03/06/2026):
//   - PESO POR RECENCIA: cada conversación llega partida en "estado reciente"
//     vs "contexto histórico". Se pide priorizar lo reciente y MARCAR como
//     histórico/obsoleto lo viejo (un rol de hace años NO debe pesar como
//     estado actual).
//   - CONCIENCIA DEL OBJETIVO: si la persona está vinculada a objetivos, se
//     inyecta su contexto y se piden señales relevantes al objetivo (interés/
//     temperatura, objeciones, compromisos, timing, decisores, próximos pasos).
//   - EXTRACCIÓN ESTRUCTURADA: categorías (profesional/comercial/reciprocidad/
//     riesgo/objeción/personal) + una próxima acción sugerida.
//
// INVARIANTES (#1 bienestar, #5 correlación ≠ causa / no diagnóstico):
//   - Sólo hechos presentes en el material. No inventar.
//   - Sin diagnóstico clínico, etiquetas de salud mental ni consejo médico.
//   - Sin causalidad ni predicción. Observacional, sobrio, sin dramatizar.

import type { ObservationDigest } from './deriveFromObservations'
import type { DerivedMemoryItem } from './deriveFromObservations'
import { recencyLabel } from './conversationSignals'

export const DERIVE_MEMORIES_SYSTEM_PROMPT = `Eres el módulo de memoria de SIR, un sistema operativo personal centrado en el bienestar y en ayudar al usuario a actuar sobre lo que le importa.

Recibís un conjunto de observaciones ya capturadas sobre una persona (conversaciones, perfiles, notas), cada una con un índice. Las conversaciones largas vienen PARTIDAS en "estado reciente" (lo último que pasó) y "contexto histórico" (lo viejo). Opcionalmente recibís los OBJETIVOS del usuario vinculados a esta persona.

Tu tarea: destilar las MEMORIAS NOTABLES y ACCIONABLES del vínculo — priorizando lo RECIENTE y lo RELEVANTE A LOS OBJETIVOS — en una lista JSON.

Devolvé EXCLUSIVAMENTE un objeto JSON con esta forma (sin texto adicional, sin markdown):
{
  "memories": [
    {
      "observationIndex": 0,
      "type": "episodic" | "semantic" | "emotional" | "social",
      "category": "profesional" | "comercial" | "reciprocidad" | "riesgo" | "objecion" | "personal" | "proxima_accion",
      "title": "string corto",
      "content": "1-2 oraciones, en tercera persona, factual",
      "recency": "recent" | "historical",
      "isStale": true | false,
      "emotionalCharge": -10..10,
      "importance": 1..10,
      "tags": ["string", ...]
    }
  ]
}

QUÉ EXTRAER (priorizá en este orden cuando el material lo permita):
- profesional: rol y empresa ACTUALES de la persona (no los de hace años).
- comercial: oportunidades, interés/temperatura, compromisos, timing, decisores, "ganchos" útiles para los objetivos del usuario.
- objecion / riesgo: dudas, frenos, condiciones, señales de enfriamiento.
- reciprocidad: favores dados/recibidos, deudas de gratitud, gestos de cuidado.
- personal: datos personales relevantes RECIENTES (familia, salud, planes).
- proxima_accion: UNA memoria con la próxima acción concreta sugerida para el usuario respecto de esta persona/objetivo (category="proxima_accion", importance alta).

REGLAS DE RECENCIA (clave):
- "recency": "recent" para el estado actual / lo accionable; "historical" para contexto viejo que ya no es el estado de hoy.
- "isStale": true si el hecho YA NO está vigente (ej. "fue delegada de clase hace años", "trabajaba en X" si ahora trabaja en otro lado). Lo viejo se conserva como contexto pero NO debe dominar: marcalo, no lo infles.
- Si la conversación es reciente, su estado actual manda sobre cualquier dato antiguo.

REGLAS ESTRICTAS:
- Hasta 8 memorias por conversación; hasta 2 por perfil/nota. Si algo no aporta, omitilo. Calidad > cantidad, pero NO subextraigas: una conversación rica debe dar varias señales, no 1-2 triviales.
- "observationIndex" DEBE ser el índice de una observación provista.
- Usá SOLO información presente en el material. PROHIBIDO inventar hechos, nombres, fechas, cifras o sentimientos no expresados. Si el objetivo habla de un deal pero la charla no lo toca, NO lo inventes.
- PROHIBIDO: diagnóstico clínico, etiquetas de salud mental, consejo médico/psicológico, afirmaciones de causa-efecto, predicciones.
- "type": 'emotional' SOLO si la observación reporta un estado emocional explícito.
- Tono observacional y sobrio, sin dramatizar. Español neutro.
- Si no hay nada notable en todo el conjunto, devolvé {"memories": []}.`

/** Recorte defensivo de listas para el prompt (no inflar el input). */
function bullets(items: string[], cap: number): string {
  return items
    .slice(0, cap)
    .map((s) => `    - ${s}`)
    .join('\n')
}

/** Bloque de una conversación partido por recencia para el prompt. */
function conversationBlock(d: ObservationDigest): string[] {
  const c = d.conversation
  if (!c) {
    // Conversación sin material rico (o data vieja) → fallback al texto plano.
    const lines: string[] = []
    if (d.text) lines.push(`  resumen: ${d.text}`)
    if (d.topics.length > 0) lines.push(`  temas: ${d.topics.join(', ')}`)
    return lines
  }
  const lines: string[] = []
  const span =
    c.firstISO && c.lastISO ? `${c.firstISO.slice(0, 10)} → ${c.lastISO.slice(0, 10)}` : 'rango desconocido'
  const recency = c.overallRecency ? recencyLabel(c.overallRecency) : 'recencia desconocida'
  lines.push(`  conversación: ${c.messageCount} mensajes · ${span} · última actividad: ${recency}`)
  if (c.recentBlocks.length > 0) {
    lines.push('  ESTADO RECIENTE (priorizar):')
    lines.push(bullets(c.recentBlocks, 6))
  }
  if (c.historicalBlocks.length > 0) {
    lines.push('  contexto histórico (degradar / marcar como histórico):')
    lines.push(bullets(c.historicalBlocks, 6))
  }
  if (c.facts.length > 0) {
    lines.push('  hechos mencionados sobre la persona:')
    lines.push(bullets(c.facts, 12))
  }
  if (c.events.length > 0) {
    lines.push('  planes/eventos:')
    lines.push(bullets(c.events, 8))
  }
  if (c.dates.length > 0) {
    lines.push('  fechas mencionadas:')
    lines.push(
      bullets(
        c.dates.map((dt) => {
          const r = dt.recency ? ` [${recencyLabel(dt.recency)}]` : ''
          return `${dt.label}${dt.dateISO ? ` (${dt.dateISO.slice(0, 10)})` : ''}${r}`
        }),
        8,
      ),
    )
  }
  if (c.topics.length > 0) lines.push(`  temas: ${c.topics.join(', ')}`)
  if (c.emotionalUser) lines.push(`  estado emocional (usuario): ${c.emotionalUser}`)
  if (c.emotionalOther) lines.push(`  estado emocional (persona): ${c.emotionalOther}`)
  return lines
}

/** Construye el mensaje de usuario con las observaciones indexadas + objetivos. */
export function buildDeriveInput(
  personName: string,
  digests: ObservationDigest[],
  goalContext?: string | null,
): string {
  const blocks = digests.map((d) => {
    const header = `#${d.index} [${d.captureType}] ${d.observedAt.slice(0, 10)}`
    const body = conversationBlock(d)
    // Para no-conversaciones, conversationBlock ya cae al texto plano; sumamos
    // estados emocionales si los hubiera (perfiles no los traen).
    if (!d.conversation) {
      if (d.emotionalUser) body.push(`  estado (usuario): ${d.emotionalUser}`)
      if (d.emotionalOther) body.push(`  estado (${personName}): ${d.emotionalOther}`)
    }
    return [header, ...body].join('\n')
  })

  const parts: string[] = [`Persona: ${personName}`]
  if (goalContext) {
    parts.push(
      '',
      'OBJETIVOS DEL USUARIO VINCULADOS A ESTA PERSONA (extraé señales relevantes a esto, sin inventar):',
      goalContext,
    )
  }
  parts.push('', 'Observaciones:', blocks.join('\n\n'), '', 'Destilá las memorias notables en el JSON especificado.')
  return parts.join('\n')
}

/**
 * Parsea la respuesta del LLM a DerivedMemoryItem[]. Tolerante: extrae el
 * primer bloque {...} aunque venga con prosa o fences. Devuelve [] si no hay
 * JSON válido o la forma no calza (el caller cae al fallback determinístico).
 */
export function parseDeriveResponse(raw: string): DerivedMemoryItem[] {
  if (!raw || typeof raw !== 'string') return []
  // Tomar desde el primer "{" hasta el último "}" (tolera fences ```json).
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  const memories = (parsed as { memories?: unknown })?.memories
  if (!Array.isArray(memories)) return []

  const out: DerivedMemoryItem[] = []
  for (const m of memories) {
    if (typeof m !== 'object' || m === null) continue
    const obj = m as Record<string, unknown>
    if (typeof obj.observationIndex !== 'number') continue
    out.push({
      observationIndex: obj.observationIndex,
      type: typeof obj.type === 'string' ? obj.type : undefined,
      title: typeof obj.title === 'string' ? obj.title : undefined,
      content: typeof obj.content === 'string' ? obj.content : undefined,
      category: typeof obj.category === 'string' ? obj.category : undefined,
      recency: obj.recency === 'recent' || obj.recency === 'historical' ? obj.recency : undefined,
      isStale: obj.isStale === true,
      emotionalCharge:
        typeof obj.emotionalCharge === 'number' ? obj.emotionalCharge : undefined,
      importance: typeof obj.importance === 'number' ? obj.importance : undefined,
      tags: Array.isArray(obj.tags)
        ? obj.tags.filter((t): t is string => typeof t === 'string')
        : undefined,
    })
  }
  return out
}
