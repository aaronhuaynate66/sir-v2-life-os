// SIR V2 — Prompt del Briefing IA (#16 botón top-right del detail page).
//
// Genera un briefing contextual y accionable sobre una persona, a partir
// de sus memorias asociadas + metadata del vínculo + el ESTADO RECIENTE del
// usuario. A diferencia de "Lo personal" (#8, retrato narrativo cacheado en
// person_synthesis), el briefing es EFÍMERO (no se persiste): es un "ponete al
// día antes de hablarle" que el usuario pide en el momento.
//
// RAZÓN DE SER (Aaron, 2026-06-13): mejorar las relaciones = la suma de MI
// estado + lo que pasa con el otro. Por eso el briefing cruza el estado
// reciente del usuario, pero con una regla dura: el estado calibra el TIMING y
// el TONO de la oportunidad — NUNCA explica el pasado ni se vuelve causa de lo
// que salió mal. La salida mira hacia adelante (oportunidad), no hacia atrás
// (diagnóstico).
//
// Invariantes:
//   - #1 bienestar, no engagement: oportunidades que cuidan el vínculo y al
//     usuario, jamás tácticas de manipulación o de "recuperar terreno".
//   - #5 sin decisiones sensibles: nada de diagnóstico clínico ni consejo
//     médico/psicológico. No inventar hechos.
//   - La oportunidad PUEDE ser un límite o una conversación franca: mejorar
//     una relación no siempre es acercarse.

export const BRIEFING_SYSTEM_PROMPT = `Eres el módulo de briefing relacional de SIR, un sistema operativo personal centrado en el bienestar.

Tu tarea: preparar al usuario para retomar contacto con una persona, en base a sus memorias asociadas, al estado del vínculo y al estado reciente del propio usuario. Es un resumen para "ponerse al día" que termina en una OPORTUNIDAD concreta hacia adelante.

FORMATO DE SALIDA (texto plano, exactamente esta estructura):
TL;DR: una sola oración con lo esencial del vínculo ahora mismo.

Contexto: 1-2 oraciones sobre quién es y qué pasó recientemente entre ustedes.

Dinámica: 1-2 oraciones sobre el tono y los temas que vienen apareciendo.

Oportunidad: 1 acción concreta hacia ADELANTE para el próximo contacto. Debe servir al vínculo y al bienestar del usuario. Puede ser un acercamiento (un tema para retomar, algo por lo que preguntar, un gesto de cuidado) O un límite sano / una conversación franca: mejorar una relación no siempre es acercarse.

REGLAS ESTRICTAS:
- Usá SOLO la información provista. No inventes nombres, fechas, eventos ni rasgos.
- El ESTADO RECIENTE del usuario sirve únicamente para calibrar el TIMING y el TONO de la oportunidad (ej: si viene con poca energía o durmió poco, sugerí un primer paso liviano y dejar lo difícil para cuando esté entero). PROHIBIDO usarlo para explicar por qué la relación va mal, para atribuir causas a lo que pasó, o para dar consejo de salud. Mirá hacia adelante, no hacia atrás.
- PROHIBIDO: diagnósticos clínicos, etiquetas de salud mental, consejo médico/psicológico, tácticas de manipulación, jugadas para "obtener" algo o "recuperar terreno", generar dependencia.
- Tono cálido, directo y honesto. Si hay poca información, decilo y mantené el briefing corto.
- Español neutro. Sin markdown, sin viñetas con guiones, sin emojis. Respetá las etiquetas "TL;DR:", "Contexto:", "Dinámica:", "Oportunidad:" tal cual, cada una en su propio bloque separado por una línea en blanco.`

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

/** Estado reciente del usuario (no de la persona): promedios 1-5 por tipo
 *  sobre los últimos días. Calibra timing/tono de la Oportunidad. Opcional:
 *  si no hay registros recientes, el briefing corre igual sin esta sección. */
export interface BriefingSelfStat {
  /** 'mood' | 'energy' | 'sleep' | 'pain' (los numéricos del usuario). */
  kind: string
  /** Promedio 1-5. */
  avg: number
  /** Cantidad de registros que componen el promedio. */
  count: number
}

const SELF_KIND_ES: Record<string, string> = {
  mood: 'ánimo',
  energy: 'energía',
  sleep: 'sueño',
  pain: 'dolor',
}

export function buildBriefingInput(
  facts: BriefingPersonFacts,
  memories: BriefingMemory[],
  selfStats: BriefingSelfStat[] = [],
): string {
  const lines: string[] = [
    `Persona: ${facts.name}`,
    `Tipo de relación: ${facts.relationship} · categoría: ${facts.category}`,
  ]
  if (facts.lastContact) lines.push(`Último contacto registrado: ${facts.lastContact}`)
  if (typeof facts.importanceScore === 'number') lines.push(`Importancia: ${facts.importanceScore}/10`)
  if (facts.energyImpact) lines.push(`Impacto energético: ${facts.energyImpact}`)

  // Estado reciente del USUARIO (sólo los numéricos relevantes para timing/tono).
  const relevant = selfStats.filter((s) => SELF_KIND_ES[s.kind] && s.count > 0)
  if (relevant.length > 0) {
    lines.push('', 'Tu estado reciente (últimos días, promedio 1-5 — para calibrar timing/tono, NO como causa):')
    for (const s of relevant) {
      lines.push(`  - ${SELF_KIND_ES[s.kind]}: ${s.avg.toFixed(1)}/5 (n=${s.count})`)
    }
  }

  lines.push('', `Memorias asociadas (${memories.length}, de más reciente a más antigua):`)
  memories.forEach((m, i) => {
    lines.push(`${i + 1}. [${m.timestamp.slice(0, 10)} · ${m.type}] ${m.content}`)
  })
  lines.push('', 'Escribí el briefing con la estructura indicada, cerrando con la Oportunidad.')
  return lines.join('\n')
}
