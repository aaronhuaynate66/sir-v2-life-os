// SIR V2 — Catálogo de técnicas de propaganda / manipulación retórica (16·M3).
//
// LA LISTA canónica (se actualiza acá y la usan las dos capas: el detector puro
// y el deep-scan con IA). Basada en la taxonomía de técnicas de persuasión de
// SemEval (2020 Task 11 / 2021 Task 6), agrupada como en el propaganda-detection
// -toolkit (aahepburn, MIT): apelaciones emocionales, falacias lógicas,
// manipulación de credibilidad y recursos retóricos.
//
// Uso en SIR = DEFENSA: reconocer cómo te están encuadrando/presionando, para
// frenar y pensar. Nunca para generar propaganda (lo corta el guardrail 16·M5).
// `pure: true` = tiene firma léxica y la detecta la capa regex client-side;
// `pure: false` = necesita entender el argumento → solo el deep-scan con IA.

export type TechniqueCategory = 'emocional' | 'falacia' | 'credibilidad' | 'retorica'

export interface Technique {
  id: string
  label: string
  category: TechniqueCategory
  /** Qué es, en una línea (para la UI y el prompt del deep-scan). */
  definition: string
  /** ¿La detecta la capa pura (regex client-side)? */
  pure: boolean
}

export const CATEGORY_LABEL: Record<TechniqueCategory, string> = {
  emocional: 'Apelación emocional',
  falacia: 'Falacia lógica',
  credibilidad: 'Manipulación de credibilidad',
  retorica: 'Recurso retórico',
}

/** Las 23 técnicas. Editar acá para mantener la lista. */
export const TECHNIQUES: Technique[] = [
  // ── Apelaciones emocionales ──────────────────────────────────────────────
  { id: 'loaded_language', label: 'Lenguaje cargado', category: 'emocional', pure: false,
    definition: 'Palabras con fuerte carga emocional (positiva o negativa) para influir sin argumentar.' },
  { id: 'name_calling', label: 'Etiquetas / descalificación', category: 'emocional', pure: false,
    definition: 'Ponerle un rótulo peyorativo (o glorificante) a algo o alguien en vez de argumentar.' },
  { id: 'appeal_to_fear', label: 'Apelación al miedo', category: 'emocional', pure: true,
    definition: 'Instalar miedo o una amenaza para que aceptes algo o rechaces otra cosa.' },
  { id: 'flag_waving', label: 'Apelación al grupo / identidad', category: 'emocional', pure: true,
    definition: 'Invocar la pertenencia ("los nuestros", la patria, el equipo) para justificar una postura.' },
  { id: 'appeal_to_emotion', label: 'Apelación a emociones fuertes', category: 'emocional', pure: false,
    definition: 'Usar pena, indignación o esperanza para saltear el razonamiento.' },
  // ── Falacias lógicas ─────────────────────────────────────────────────────
  { id: 'causal_oversimplification', label: 'Causa única (sobresimplificación)', category: 'falacia', pure: false,
    definition: 'Reducir algo complejo a una sola causa cuando hay varias.' },
  { id: 'false_dilemma', label: 'Falso dilema', category: 'falacia', pure: true,
    definition: 'Presentar solo dos opciones ("o esto o aquello") cuando hay más.' },
  { id: 'hasty_generalization', label: 'Generalización apresurada', category: 'falacia', pure: false,
    definition: 'Sacar una regla general de uno o pocos casos.' },
  { id: 'straw_man', label: 'Hombre de paja', category: 'falacia', pure: false,
    definition: 'Tergiversar tu posición en una versión más fácil de atacar.' },
  { id: 'whataboutism', label: '"¿Y tú qué?" (desvío)', category: 'falacia', pure: true,
    definition: 'Responder a una crítica acusando al otro de algo, en vez de contestar.' },
  { id: 'red_herring', label: 'Pista falsa (dato irrelevante)', category: 'falacia', pure: false,
    definition: 'Introducir algo irrelevante para desviar la atención del punto real.' },
  { id: 'reductio_ad_hitlerum', label: 'Culpa por asociación', category: 'falacia', pure: true,
    definition: 'Descalificar una idea vinculándola con algo/alguien odiado ("eso es de dictadores").' },
  // ── Manipulación de credibilidad ─────────────────────────────────────────
  { id: 'appeal_to_authority', label: 'Apelación a la autoridad', category: 'credibilidad', pure: true,
    definition: 'Apoyar algo solo en "los expertos dicen" / "está comprobado", sin mostrar el fundamento.' },
  { id: 'bandwagon', label: 'Efecto arrastre', category: 'credibilidad', pure: true,
    definition: '"Todos lo hacen / todos lo piensan", así que tú también deberías.' },
  { id: 'glittering_generalities', label: 'Generalidades brillantes', category: 'credibilidad', pure: false,
    definition: 'Palabras-virtud vagas (libertad, familia, cambio) sin contenido concreto.' },
  { id: 'doubt', label: 'Sembrar duda', category: 'credibilidad', pure: true,
    definition: 'Poner en duda la credibilidad de alguien/algo sin pruebas ("¿quién te dice que…?").' },
  { id: 'ad_hominem', label: 'Ataque a la persona', category: 'credibilidad', pure: true,
    definition: 'Atacar a quien habla en vez de a su argumento.' },
  // ── Recursos retóricos ───────────────────────────────────────────────────
  { id: 'repetition', label: 'Repetición', category: 'retorica', pure: false,
    definition: 'Repetir una idea hasta que suene verdadera.' },
  { id: 'slogans', label: 'Eslóganes', category: 'retorica', pure: false,
    definition: 'Frases cortas y pegadizas que reemplazan al argumento.' },
  { id: 'thought_terminating', label: 'Cliché que corta el pensamiento', category: 'retorica', pure: true,
    definition: 'Frase hecha que cierra la discusión ("es lo que hay", "así son las cosas").' },
  { id: 'exaggeration_minimization', label: 'Exageración / minimización', category: 'retorica', pure: true,
    definition: 'Agrandar o achicar algo fuera de proporción ("el peor de la historia", "no es nada").' },
  { id: 'obfuscation', label: 'Vaguedad intencional', category: 'retorica', pure: false,
    definition: 'Lenguaje deliberadamente vago o confuso para no comprometerse.' },
  { id: 'appeal_to_popularity', label: 'Apelación a la costumbre', category: 'retorica', pure: true,
    definition: '"Siempre se hizo así" / "es lo normal" como razón para no cambiar.' },
]

export const TECHNIQUE_BY_ID: Record<string, Technique> = Object.fromEntries(
  TECHNIQUES.map((t) => [t.id, t]),
)

export const PURE_TECHNIQUE_IDS = TECHNIQUES.filter((t) => t.pure).map((t) => t.id)
