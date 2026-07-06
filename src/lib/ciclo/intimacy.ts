// SIR V2 — Ciclo × intimidad de pareja: guía de ATUNAMIENTO (no táctica). PURO.
//
// Cruza la fase del ciclo con el contexto relacional para sugerir cómo estar más
// presente y conectar mejor — NUNCA para "cronometrar" o instrumentalizar. Base:
// - Deseo × ciclo (tendencia, no ley): sube hacia folicular/ovulación (estradiol +
//   testosterona), baja en lútea/SPM (progesterona). Variación entre personas ENORME.
// - Nagoski (Come As You Are): el deseo lo moldea el CONTEXTO, no las hormonas —
//   frenos (estrés, tensión, distracción) vs. aceleradores (conexión, seguridad).
//   El deseo suele ser RESPONSIVO: emerge de la conexión, no aparece solo.
// - Perel (Mating in Captivity): el deseo pide espacio, novedad y juego — no solo
//   más cercanía.
//
// LÍNEA (docs/17): es CUIDADO, no manejo. La emoción de ella es real tenga la fase
// que tenga; jamás "estás hormonal"; jamás aprovechar una fase para "conseguir algo".

import type { CyclePhase } from './phase'

export interface IntimacyContext {
  /** ¿Hay una tensión/conflicto reciente sin resolver? (el freno más grande). */
  recentTension?: boolean
  /** Su energía/ánimo reciente viene bajo. */
  lowEnergy?: boolean
  /** El vínculo viene enfriándose (cadencia/tono). */
  cooling?: boolean
  personName?: string
}

export interface IntimacyGuidance {
  /** Qué TIENDE a traer esta fase (honesto: tendencia, no regla). */
  phaseNote: string
  /** El freno/acelerador que más pesa ahora (Nagoski). */
  lever: string
  /** El movimiento de cuidado/conexión (Perel: espacio y novedad; no táctica). */
  move: string
  /** Recordatorio honesto e innegociable (contexto > hormonas; cuidado, no manejo). */
  caution: string
}

function firstName(name?: string): string {
  const n = (name ?? '').trim().split(/\s+/)[0]
  return n || 'ella'
}

export function intimacyGuidance(cycle: CyclePhase, ctx: IntimacyContext = {}): IntimacyGuidance {
  const her = firstName(ctx.personName)

  // Nota de fase — tendencia honesta.
  let phaseNote: string
  if (cycle.isFertileWindow || cycle.phase === 'ovulation') {
    phaseNote = `Ventana fértil / ovulación: el deseo y la energía TIENDEN a correr más altos por acá — pero es una tendencia, varía mucho.`
  } else if (cycle.phase === 'follicular') {
    phaseNote = `Fase folicular (post-período): la energía y el ánimo suelen ir subiendo.`
  } else if (cycle.isPmsWindow) {
    phaseNote = `Ventana premenstrual: puede venir más sensibilidad y menos energía. No es "estar mal" — es contexto.`
  } else if (cycle.phase === 'luteal') {
    phaseNote = `Fase lútea: la energía puede empezar a bajar (sube la progesterona).`
  } else {
    phaseNote = `Período: momento de presencia y cuidado, sin exigir nada.`
  }

  // El lever (Nagoski): el freno/acelerador que manda AHORA, en orden de prioridad.
  let lever: string
  let move: string
  if (ctx.recentTension) {
    lever = `El freno más grande ahora es una tensión sin resolver. Ninguna "ventana" enciende con eso puesto.`
    move = `Reconectá de verdad primero: escuchá, repará lo que quedó abierto. Nada de "movidas" hasta eso — sería vacío.`
  } else if (ctx.cooling) {
    lever = `El vínculo viene enfriándose: lo que falta es reconexión real, no timing.`
    move = `Volvé a lo simple: presencia, atención genuina, un gesto sin agenda. El deseo se reconstruye desde ahí.`
  } else if (ctx.lowEnergy || cycle.isPmsWindow || cycle.phase === 'luteal' || cycle.phase === 'menstrual') {
    lever = `El acelerador de esta semana es bajarle la carga y el estrés (los frenos), no empujar. El deseo responde al contexto.`
    move = `Estar y aliviar: hacele más liviano el día, suavidad, cero presión. Que sienta que estás, no que esperás algo.`
  } else {
    lever = `El contexto viene bien — ahí la ventana ayuda. Pero lo que enciende es la conexión, no la fecha.`
    move = `Buen momento para proponer algo lindo y con NOVEDAD (una salida, un plan distinto): el deseo pide espacio y juego, no solo cercanía.`
  }

  const caution =
    `Es una TENDENCIA, no una regla: lo que ${her} siente es real tenga la fase que tenga. ` +
    `Esto es para cuidarla y conectar mejor, no para "manejarla" ni cronometrar nada.`

  return { phaseNote, lever, move, caution }
}
