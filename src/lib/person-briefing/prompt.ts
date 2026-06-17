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

Oportunidad: 1 acción concreta hacia ADELANTE para el próximo contacto. Debe servir al vínculo y al bienestar del usuario. Puede ser un acercamiento (un tema para retomar, algo por lo que preguntar, un gesto de cuidado), un movimiento estratégico que apalanque la red profesional (ej. apoyarse en un colega de confianza del mismo grupo, conectar un objetivo en juego), O un límite sano / una conversación franca: mejorar una relación no siempre es acercarse.

REGLAS ESTRICTAS:
- Usá SOLO la información provista. No inventes nombres, fechas, eventos ni rasgos.
- RECENCIA: la fecha de "Último contacto registrado" (si está presente) es la verdad sobre cuándo se contactaron por última vez — NO la fecha de la memoria más reciente. Las memorias pueden ser de hace semanas aunque el contacto sea de hoy (el contacto reciente puede ser breve y no haber dejado memoria). PROHIBIDO afirmar "sin contacto hace X", "hace dos semanas que no hablan" o similar si el último contacto registrado es más reciente. Como mucho, podés notar que el contacto reciente fue breve o que el ritmo bajó, sin negar que hubo contacto.
- El ESTADO RECIENTE del usuario sirve únicamente para calibrar el TIMING y el TONO de la oportunidad (ej: si viene con poca energía o durmió poco, sugerí un primer paso liviano y dejar lo difícil para cuando esté entero). PROHIBIDO usarlo para explicar por qué la relación va mal, para atribuir causas a lo que pasó, o para dar consejo de salud. Mirá hacia adelante, no hacia atrás.
- La RED PROFESIONAL (otras personas del usuario en la misma empresa/grupo) es inteligencia estratégica legítima: usala para leer el tablero (quién se relaciona con quién, intereses compartidos, vías de influencia, con quién ya hay un objetivo en juego) y, si aplica, proponé en la Oportunidad un movimiento que apalanque esas conexiones reales. Esto NO es manipulación: la línea es que el movimiento se apoye en vínculos GENUINOS y en intereses reales, sin engaño, sin coerción y sin usar a nadie en contra de su propio interés. Si una jugada requeriría mentir, presionar o dañar a alguien, no la sugieras.
- Si un colega tiene un cumpleaños cerca, un contacto frío o un vínculo a cuidar, usalo para TIMING y para sugerir un acercamiento GENUINO (saludar, retomar). PERO un gesto de cuidado —como saludar un cumpleaños— vale por sí mismo y NO debe presentarse como un pretexto para extraer información o sacar ventaja. El saludo se sostiene aunque no hubiera nada que ganar; si de esa conexión real surge contexto útil, mejor, pero ese no es el motivo del gesto.
- CONFLICTO RECIENTE: si en los datos aparece una "ALERTA: conversación reciente tensa", NO la ignores ni la suavices hasta volverla invisible. Nombrala explícitamente en Dinámica (qué pasó, en términos del usuario, sin diagnosticar ni psicoanalizar a nadie) y hacé que la Oportunidad sea un paso concreto para MANEJAR la situación: puede ser reparar, poner un límite sano, o una conversación franca. La reparación NUNCA exige que el usuario renuncie a sus objetivos para apaciguar al otro.
- OBJETIVO EN JUEGO: si el conflicto reciente es sobre uno de los objetivos del usuario (sobre todo TU NORTE, el objetivo ancla), nombrá esa tensión con honestidad — el vínculo de un lado, el objetivo del otro — y orientá la Oportunidad a sostener AMBOS: cuidar la relación sin abandonar el objetivo. No tomes partido por el otro contra el objetivo del usuario, ni al revés; mostrá el trade-off real y un siguiente paso.
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
  /** Empresa/empleador del SUJETO del briefing (no de los colegas). Ancla el
   *  Contexto para no confundir quién trabaja dónde. */
  organization?: string
  /** Grupo/holding del sujeto. */
  orgGroup?: string
  /** Conversación reciente TENSA detectada (tono ≤2 en la ventana reciente del
   *  chat importado o una interacción reciente). El briefing debe nombrarla y
   *  ayudar a manejarla, no enterrarla. */
  recentConflict?: {
    /** YYYY-MM-DD del conflicto. */
    date: string
    /** Tono 1-5 (≤2 = tenso). */
    toneScore: number
    /** Textura del conflicto (resumen/nota), para que el briefing sepa de qué fue. */
    note: string
  }
}

/** Un objetivo activo del usuario, para que el briefing pueda conectar un
 *  conflicto con el objetivo que está en juego (sobre todo el norte). */
export interface BriefingActiveGoal {
  title: string
  /** true si es el objetivo ANCLA (TU NORTE). */
  isNorte: boolean
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

/** Una persona de la red profesional del usuario (mismo empleador/grupo que la
 *  persona del briefing). Contexto estratégico: con quién más se cruza este
 *  vínculo dentro de la misma organización. */
export interface BriefingColleague {
  name: string
  /** Empresa/empleador o grupo que comparten (para nombrar el lazo). */
  orgLabel?: string
  /** importancia 1-10 del colega para el usuario. */
  importance?: number
  /** Título de un objetivo activo del usuario que ya involucra a este colega. */
  activeGoalTitle?: string
  /** Días hasta el próximo cumpleaños del colega (0 = hoy). Señal de timing y
   *  de oportunidad de cuidado GENUINA. */
  birthdayInDays?: number
  /** Último contacto registrado con el colega (YYYY-MM-DD). */
  lastContact?: string | null
  /** Score del vínculo con el colega 0-100. */
  relScore?: number
}

export function buildBriefingInput(
  facts: BriefingPersonFacts,
  memories: BriefingMemory[],
  selfStats: BriefingSelfStat[] = [],
  colleagues: BriefingColleague[] = [],
  activeGoals: BriefingActiveGoal[] = [],
): string {
  const lines: string[] = [
    `Persona: ${facts.name}`,
    `Tipo de relación: ${facts.relationship} · categoría: ${facts.category}`,
  ]
  if (facts.lastContact) lines.push(`Último contacto registrado: ${facts.lastContact}`)
  if (typeof facts.importanceScore === 'number') lines.push(`Importancia: ${facts.importanceScore}/10`)
  if (facts.energyImpact) lines.push(`Impacto energético: ${facts.energyImpact}`)
  if (facts.organization) lines.push(`Empresa/empleador de ${facts.name}: ${facts.organization}`)
  if (facts.orgGroup) lines.push(`Grupo/holding de ${facts.name}: ${facts.orgGroup}`)

  // ALERTA de conflicto reciente: lo primero que el briefing tiene que ver.
  if (facts.recentConflict) {
    const c = facts.recentConflict
    lines.push(
      '',
      `ALERTA: conversación reciente tensa (${c.date}, tono ${c.toneScore}/5). Algo se tensó en el último contacto. Texto: ${c.note}`,
    )
  }

  // Objetivos activos del usuario — para conectar el conflicto con lo que está
  // en juego (sobre todo el norte). El prompt decide si aplica.
  if (activeGoals.length > 0) {
    lines.push('', 'Tus objetivos activos (por si el conflicto toca alguno):')
    for (const g of activeGoals) {
      lines.push(`  - ${g.title}${g.isNorte ? ' (TU NORTE / objetivo ancla)' : ''}`)
    }
  }

  // Estado reciente del USUARIO (sólo los numéricos relevantes para timing/tono).
  const relevant = selfStats.filter((s) => SELF_KIND_ES[s.kind] && s.count > 0)
  if (relevant.length > 0) {
    lines.push('', 'Tu estado reciente (últimos días, promedio 1-5 — para calibrar timing/tono, NO como causa):')
    for (const s of relevant) {
      lines.push(`  - ${SELF_KIND_ES[s.kind]}: ${s.avg.toFixed(1)}/5 (n=${s.count})`)
    }
  }

  // Red profesional: colegas del mismo empleador/grupo (inteligencia estratégica).
  if (colleagues.length > 0) {
    lines.push('', `Red profesional relevante (misma empresa/grupo — ${colleagues.length}):`)
    for (const c of colleagues) {
      const bits: string[] = []
      if (c.orgLabel) bits.push(c.orgLabel)
      if (typeof c.importance === 'number') bits.push(`importancia ${c.importance}/10 para vos`)
      if (typeof c.relScore === 'number') bits.push(`vínculo ${c.relScore}/100`)
      if (c.lastContact) bits.push(`último contacto ${c.lastContact}`)
      if (typeof c.birthdayInDays === 'number') {
        const b =
          c.birthdayInDays === 0
            ? 'cumple HOY'
            : c.birthdayInDays === 1
              ? 'cumple mañana'
              : `cumple en ${c.birthdayInDays} días`
        bits.push(b)
      }
      if (c.activeGoalTitle) bits.push(`tenés un objetivo activo que lo involucra: "${c.activeGoalTitle}"`)
      lines.push(`  - ${c.name}${bits.length ? ' — ' + bits.join(' · ') : ''}`)
    }
  }

  lines.push('', `Memorias asociadas (${memories.length}, de más reciente a más antigua):`)
  memories.forEach((m, i) => {
    lines.push(`${i + 1}. [${m.timestamp.slice(0, 10)} · ${m.type}] ${m.content}`)
  })
  lines.push('', 'Escribí el briefing con la estructura indicada, cerrando con la Oportunidad.')
  return lines.join('\n')
}
