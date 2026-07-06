// SIR V2 — Alter ego filosófico: catálogo de corrientes como HEURÍSTICOS de
// decisión (no horóscopo). Cada escuela declara cuándo sirve, qué pregunta te
// hace, qué movida recomienda y cuál es su punto ciego. Extiende la idea de las
// 12 lentes (docs/10) al plano filosófico. PURO (solo datos).
//
// LÍNEA ÉTICA (docs 16/19): Maquiavelo = LEER el poder, nunca licencia para
// engañar. Kant es el contrapeso permanente. Sabiduría para enfrentar, no armas
// para dañar.

export type StanceTag =
  | 'control' | 'perdida' | 'poder' | 'integridad' | 'sentido' | 'motivacion'
  | 'habito' | 'soltar' | 'decision' | 'conflicto' | 'incertidumbre' | 'reinvencion'

export type Domain = 'afectivo' | 'profesional' | 'ambos'

export interface School {
  id: string
  name: string
  thinker: string
  principle: string
  /** La pregunta que te obliga a hacerte. */
  question: string
  /** La movida que recomienda (imperativo, en tu voz). */
  stance: string
  bestFor: StanceTag[]
  domains: Domain[]
  /** Su punto ciego — para no absolutizarla. */
  blindSpot: string
  /** true = escuela de poder → se acompaña SIEMPRE con Kant de freno. */
  isPower?: boolean
}

export const SCHOOLS: School[] = [
  {
    id: 'estoicismo', name: 'Estoicismo', thinker: 'Epicteto · Marco Aurelio',
    principle: 'La dicotomía del control: distinguí lo que depende de vos de lo que no, y poné tu energía solo en lo primero.',
    question: '¿Qué parte de esto controlás de verdad, y qué estás gastando en lo que no?',
    stance: 'Soltá el resultado que no manejás. Actuá sobre tu parte con calma; lo demás, aceptalo sin pelearte.',
    bestFor: ['control', 'perdida', 'conflicto', 'incertidumbre'], domains: ['ambos'],
    blindSpot: 'Puede volverse pasividad o frialdad: no todo lo "incontrolable" es inamovible.',
  },
  {
    id: 'kant', name: 'Kant', thinker: 'Immanuel Kant',
    principle: 'Imperativo categórico: actuá según una regla que aceptarías como ley universal, y tratá a las personas como fines, nunca solo como medios.',
    question: '¿Estaría bien si TODOS hicieran esto? ¿Estoy usando a alguien como herramienta?',
    stance: 'No cruces la línea aunque convenga. Si tu movida solo funciona ocultándola, no la hagas.',
    bestFor: ['integridad', 'decision'], domains: ['ambos'],
    blindSpot: 'Rígido con las consecuencias: a veces la regla choca con el bien real de una situación.',
  },
  {
    id: 'maquiavelo', name: 'Maquiavelo', thinker: 'Nicolás Maquiavelo',
    principle: 'Realismo del poder: leé a la gente como es, no como querrías que fuera; entendé los incentivos reales y la virtù (saber leer el momento).',
    question: '¿Quién tiene el poder acá, qué gana cada uno, y cuál es el momento oportuno?',
    stance: 'Mapeá los incentivos antes de mover. Prepará tu posición con los ojos abiertos — sin ilusiones, pero sin engañar.',
    bestFor: ['poder', 'conflicto', 'decision'], domains: ['profesional'], isPower: true,
    blindSpot: 'Si se suelta del freno ético, se vuelve manipulación. LEER el poder ≠ explotar a la gente.',
  },
  {
    id: 'nietzsche', name: 'Nietzsche', thinker: 'Friedrich Nietzsche',
    principle: 'Voluntad de poder y amor fati: creá tus propios valores, superate a vos mismo, y amá tu destino en vez de resentirlo.',
    question: '¿Esto lo querés VOS, o estás obedeciendo la expectativa de otro? ¿Qué versión tuya nace acá?',
    stance: 'Dejá de pedir permiso. Elegí tu norte propio y hacé de la dificultad el material de tu próxima versión.',
    bestFor: ['motivacion', 'reinvencion', 'sentido'], domains: ['ambos'],
    blindSpot: 'Puede confundir fuerza con atropello; el "superate" mal leído ignora a los demás.',
  },
  {
    id: 'absurdismo', name: 'Absurdismo', thinker: 'Albert Camus',
    principle: 'El sentido no viene dado: el universo es indiferente, y aun así (o por eso) elegís rebelarte creando tu propio sentido. Hay que imaginar a Sísifo feliz.',
    question: 'Si nada tiene un sentido dado, ¿qué sentido elegís VOS ponerle a esto?',
    stance: 'No esperes que la situación te dé la razón para seguir. Poné vos el sentido y avanzá igual.',
    bestFor: ['sentido', 'perdida', 'incertidumbre'], domains: ['ambos'],
    blindSpot: 'Sin acción concreta, la "rebeldía" queda en pose; no reemplaza pedir ayuda si el bajón es clínico.',
  },
  {
    id: 'aristoteles', name: 'Aristóteles', thinker: 'Aristóteles',
    principle: 'Virtud como término medio y phronesis (sabiduría práctica): la excelencia está entre dos excesos, y se construye con hábito hacia el florecimiento (eudaimonia).',
    question: '¿Cuál es el término medio acá — ni cobarde ni temerario? ¿Qué hábito me acerca a quién quiero ser?',
    stance: 'Buscá el punto medio y convertilo en hábito. No es un gesto heroico, es la práctica sostenida.',
    bestFor: ['habito', 'decision', 'conflicto'], domains: ['ambos'],
    blindSpot: 'El "medio" puede volverse excusa para la tibieza cuando la situación pide un extremo.',
  },
  {
    id: 'utilitarismo', name: 'Utilitarismo', thinker: 'Mill · Bentham',
    principle: 'El mejor acto es el que produce el mayor bienestar para el mayor número; pensá en consecuencias, no solo en intenciones.',
    question: '¿Qué opción deja mejor al conjunto, sumando todo? ¿A quién afecta y cuánto?',
    stance: 'Comparé las opciones por su resultado neto real. Elegí la que más suma, aunque no sea la más cómoda.',
    bestFor: ['decision', 'poder'], domains: ['ambos'],
    blindSpot: 'Puede pisar a la minoría o a la persona concreta "por el bien mayor" — ahí entra Kant.',
  },
  {
    id: 'existencialismo', name: 'Existencialismo', thinker: 'Jean-Paul Sartre',
    principle: 'Estás condenado a ser libre: no hay excusa, elegís siempre, y sos responsable de lo que hacés con las cartas que te tocaron. La "mala fe" es mentirte diciendo que no tenías opción.',
    question: '¿Dónde me estoy diciendo "no tuve opción" cuando en realidad elegí?',
    stance: 'Hacete cargo de la elección. Nadie viene a salvarte de decidir; asumí y movete.',
    bestFor: ['decision', 'motivacion', 'reinvencion'], domains: ['ambos'],
    blindSpot: 'La "libertad total" ignora límites reales (materiales, de otros); puede sobrecargar de culpa.',
  },
  {
    id: 'tao_zen', name: 'Taoísmo / Budismo', thinker: 'Lao Tsé · tradición budista',
    principle: 'Wu wei (no forzar), no-apego e impermanencia: fluí con lo que hay, soltá el aferramiento, todo cambia.',
    question: '¿Estoy forzando algo que pide fluir? ¿A qué me estoy aferrando que ya cambió?',
    stance: 'Aflojá el control. No fuerces el momento; soltá lo que ya no es, y dejá que la situación respire.',
    bestFor: ['soltar', 'control', 'perdida', 'conflicto'], domains: ['ambos'],
    blindSpot: 'Malentendido como resignación: soltar no es abandonar lo que sí depende de vos.',
  },
]

export function schoolById(id: string): School | undefined {
  return SCHOOLS.find((s) => s.id === id)
}
