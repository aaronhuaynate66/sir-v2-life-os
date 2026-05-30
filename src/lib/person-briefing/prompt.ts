// SIR V2 — Prompt del Briefing IA (#16 botón top-right del detail page).
//
// Genera un briefing contextual y accionable sobre una persona, a partir
// de sus memorias asociadas + metadata del vínculo. A diferencia de "Lo
// personal" (#8, retrato narrativo cacheado en person_synthesis), el
// briefing es EFÍMERO (no se persiste): es un "ponete al día antes de
// hablarle" que el usuario pide en el momento.
//
// Reusa el mismo scaffolding que la síntesis (#8): system prompt + builder
// de input + Anthropic client en el route. Mismos invariantes:
//   - #1 bienestar, no engagement: sugerencias que cuidan el vínculo y al
//     usuario, jamás tácticas de manipulación o dependencia afectiva.
//   - #5 sin decisiones sensibles: nada de diagnóstico clínico ni consejo
//     médico/psicológico. No inventar hechos.

export const BRIEFING_SYSTEM_PROMPT = `Eres el módulo de briefing relacional de SIR, un sistema operativo personal centrado en el bienestar.

Tu tarea: preparar al usuario para retomar contacto con una persona, en base a sus memorias asociadas y al estado del vínculo. Es un resumen para "ponerse al día", accionable y breve.

FORMATO DE SALIDA (texto plano, exactamente esta estructura):
TL;DR: una sola oración con lo esencial del vínculo ahora mismo.

Contexto: 1-2 oraciones sobre quién es y qué pasó recientemente entre ustedes.

Dinámica: 1-2 oraciones sobre el tono y los temas que vienen apareciendo.

Sugerencia: 1 acción concreta y respetuosa para el próximo contacto (un tema para retomar, algo por lo que preguntar, un gesto de cuidado). Debe servir al vínculo, nunca ser una táctica para obtener algo.

REGLAS ESTRICTAS:
- Usá SOLO la información provista. No inventes nombres, fechas, eventos ni rasgos.
- PROHIBIDO: diagnósticos clínicos, etiquetas de salud mental, consejo médico/psicológico, manipulación, generar dependencia.
- Tono cálido, directo y honesto. Si hay poca información, decilo y mantené el briefing corto.
- Español neutro. Sin markdown, sin viñetas con guiones, sin emojis. Respetá las etiquetas "TL;DR:", "Contexto:", "Dinámica:", "Sugerencia:" tal cual, cada una en su propio bloque separado por una línea en blanco.`

export interface BriefingPersonFacts {
  name: string
  relationship: string
  category: string
  lastContact?: string | null
  importanceScore?: number
  energyImpact?: string
}

export interface BriefingMemory {
  type: string
  content: string
  timestamp: string
}

export function buildBriefingInput(
  facts: BriefingPersonFacts,
  memories: BriefingMemory[],
): string {
  const lines: string[] = [
    `Persona: ${facts.name}`,
    `Tipo de relación: ${facts.relationship} · categoría: ${facts.category}`,
  ]
  if (facts.lastContact) lines.push(`Último contacto registrado: ${facts.lastContact}`)
  if (typeof facts.importanceScore === 'number') lines.push(`Importancia: ${facts.importanceScore}/10`)
  if (facts.energyImpact) lines.push(`Impacto energético: ${facts.energyImpact}`)
  lines.push('', `Memorias asociadas (${memories.length}, de más reciente a más antigua):`)
  memories.forEach((m, i) => {
    lines.push(`${i + 1}. [${m.timestamp.slice(0, 10)} · ${m.type}] ${m.content}`)
  })
  lines.push('', 'Escribí el briefing con la estructura indicada.')
  return lines.join('\n')
}
