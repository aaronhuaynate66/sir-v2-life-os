// SIR V2 — Repertorio de movidas HONESTAS para la Sala de ensayo (16·M4 + M1).
//
// LA LISTA de estrategias éticas que SIR puede sugerir, con nombre. Basada en dos
// corpus pro-sociales/cooperativos (no adversariales):
//   • PersuasionForGood (ACL 2019): apelaciones honestas + rapport para "social
//     good" (logical/emotion/credibility appeal, historia personal, self-modeling).
//   • CaSiNo (negociación integrativa campsite): movidas win-win (small-talk,
//     empatía, elicit-preference, other-need, no-need/generosidad, coordinación).
//
// FILTRO POR ÁMBITO (clave, coherente con doc 15/16): en vínculos AFECTIVOS estas
// son formas de CUIDADO y CLARIDAD, nunca "tácticas" — y las más transaccionales
// (foot-in-the-door, vouch-fairness) NO aplican ahí. En lo profesional, preparación
// integrativa cuando el objetivo de Aaron se alinea con el interés del otro. Lo
// adversarial/manipulador queda afuera por diseño (y lo corta el guardrail 16·M5).

export type StrategyScope = 'afectivo' | 'profesional' | 'ambos'
export type StrategyGroup = 'conectar' | 'entender' | 'apelar' | 'dar' | 'encuadrar'

export interface Strategy {
  id: string
  label: string
  group: StrategyGroup
  scope: StrategyScope
  /** Qué es / cómo se juega, en una línea. */
  how: string
}

export const GROUP_LABEL: Record<StrategyGroup, string> = {
  conectar: 'Conectar',
  entender: 'Entender al otro',
  apelar: 'Apelar con la verdad',
  dar: 'Dar primero',
  encuadrar: 'Encuadrar el pedido',
}

/** El repertorio. Editar acá para mantener la lista. */
export const STRATEGIES: Strategy[] = [
  // ── Conectar (rapport) ───────────────────────────────────────────────────
  { id: 'small_talk', label: 'Romper el hielo', group: 'conectar', scope: 'ambos',
    how: 'Conectar como personas antes del tema; no ir de una al grano.' },
  { id: 'coordination', label: 'Ponerse del mismo lado', group: 'conectar', scope: 'ambos',
    how: 'Proponer resolverlo JUNTOS, como equipo contra el problema, no uno contra el otro.' },
  // ── Entender al otro ──────────────────────────────────────────────────────
  { id: 'empathy', label: 'Validar lo que siente', group: 'entender', scope: 'ambos',
    how: 'Nombrar y reconocer de verdad lo que el otro siente o necesita, antes de tu parte.' },
  { id: 'elicit_preference', label: 'Preguntar qué necesita', group: 'entender', scope: 'ambos',
    how: 'Preguntar qué le importa / qué necesita, en vez de suponerlo.' },
  { id: 'acknowledge_need', label: 'Reconocer su necesidad', group: 'entender', scope: 'ambos',
    how: 'Decir explícitamente que ves y respetás lo que el otro necesita (no solo lo tuyo).' },
  // ── Apelar con la verdad ─────────────────────────────────────────────────
  { id: 'personal_story', label: 'Contar tu experiencia real', group: 'apelar', scope: 'ambos',
    how: 'Compartir algo tuyo verdadero para que se entienda desde lo humano, no en abstracto.' },
  { id: 'emotion_honest', label: 'Decir lo que sentís', group: 'apelar', scope: 'ambos',
    how: 'Compartir tu emoción REAL (miedo, ganas), sin fabricarla ni exagerarla.' },
  { id: 'logical_appeal', label: 'Razón y datos', group: 'apelar', scope: 'profesional',
    how: 'Argumento con motivos y datos verificables que el otro pueda chequear.' },
  { id: 'credibility_appeal', label: 'Mostrar tu valor real', group: 'apelar', scope: 'profesional',
    how: 'Tu track-record / lo que aportás, honesto y concreto, sin inflar.' },
  { id: 'self_modeling', label: 'Predicar con el ejemplo', group: 'apelar', scope: 'profesional',
    how: 'Mostrar tu propio compromiso/acción primero, como modelo.' },
  // ── Dar primero (reciprocidad genuina) ───────────────────────────────────
  { id: 'generosity', label: 'Ceder algo que suma', group: 'dar', scope: 'ambos',
    how: 'Ofrecer algo que a vos te cuesta poco y al otro le importa (no-need): genera confianza.' },
  // ── Encuadrar el pedido ──────────────────────────────────────────────────
  { id: 'express_need_reason', label: 'Tu necesidad con el porqué', group: 'encuadrar', scope: 'ambos',
    how: 'Decir lo que necesitás CON el motivo, como pedido claro, no como exigencia ni reproche.' },
  { id: 'vouch_fairness', label: 'Apelar a lo justo', group: 'encuadrar', scope: 'profesional',
    how: 'Anclar en un criterio objetivo/justo que ambos aceptarían de antemano.' },
  { id: 'foot_in_the_door', label: 'Empezar por un paso chico', group: 'encuadrar', scope: 'profesional',
    how: 'Proponer primero un paso concreto y de bajo costo, no todo el pedido de golpe.' },
]

/** Estrategias aplicables a un ámbito. undefined/afectivo → cuidado; profesional → integrativo. */
export function strategiesForAmbito(ambito?: string, relationship?: string): Strategy[] {
  const affective =
    ambito === 'personal' ||
    ['romantic', 'family', 'friend', 'pareja', 'familia', 'amigo'].some((k) => (relationship ?? '').toLowerCase().includes(k))
  const want: StrategyScope = affective ? 'afectivo' : ambito ? 'profesional' : 'ambos'
  if (want === 'ambos') return STRATEGIES.filter((s) => s.scope === 'ambos')
  return STRATEGIES.filter((s) => s.scope === want || s.scope === 'ambos')
}

/** Bloque de texto del repertorio para inyectar en el prompt del ensayo. */
export function renderStrategiesForPrompt(ambito?: string, relationship?: string): string {
  const list = strategiesForAmbito(ambito, relationship)
  if (list.length === 0) return ''
  const affective =
    ambito === 'personal' ||
    ['romantic', 'family', 'friend'].some((k) => (relationship ?? '').toLowerCase().includes(k))
  const header = affective
    ? 'REPERTORIO DE FORMAS DE CUIDADO Y CLARIDAD (base: persuasión pro-social + comunicación cooperativa). ' +
      'Acá NO son tácticas para "conseguir" algo — son maneras honestas de entenderse. Elegí de esta lista y NOMBRALA en cada acción; jamás sugieras algo que Aaron no pueda sostener con la verdad:'
    : 'REPERTORIO DE MOVIDAS HONESTAS E INTEGRATIVAS (base: PersuasionForGood + negociación cooperativa CaSiNo). ' +
      'Preparación legítima cuando el objetivo de Aaron se alinea con el interés del otro. Elegí de esta lista y NOMBRALA en cada acción; nada de engaño, presión fabricada ni explotar debilidades:'
  const lines = [header]
  for (const s of list) lines.push(`- ${s.label} (${GROUP_LABEL[s.group]}): ${s.how}`)
  return lines.join('\n')
}
