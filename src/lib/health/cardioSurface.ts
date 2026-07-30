// SIR V2 — ¿por dónde sale un hallazgo cardíaco: ahora, mañana, o el reporte?
//
// PEDIDO DE AARON (30-jul-2026), textual: *"lo de cardiaco tiene que ser
// proactivo, si detectas una alerta o anomalía pues avisarla en el momento, si
// ves una tendencia entonces buscar un espacio tipo en la mañana, o en el reporte
// de salud"*.
//
// O sea: dos canales, y la diferencia NO es la gravedad, es la CADUCIDAD.
//
//   · AHORA    → lo que cambia lo que hace HOY. Interrumpe. Un día extremo
//                («no cargues hoy») o un patrón que ya amerita un especialista.
//   · MAÑANA   → una tendencia. No se pierde nada esperando al brief; mandarla
//                al toque solo entrena a Aaron a ignorar las notificaciones.
//   · REPORTE  → contexto que solo sirve cuando él va a mirar su salud. No se
//                empuja: se deja donde lo va a encontrar.
//
// POR QUÉ IMPORTA SEPARARLOS. La queja de fondo de Aaron sobre el brief fue
// *«así todo junto no siento que me ayude»* y *«que me recuerdes todos los días
// que mi mamá está empinchada no me ayuda en nada»*. Un aviso cardíaco que suena
// todos los días es exactamente ese muro, y encima en el tema donde el ruido
// asusta. Un canal que interrumpe solo se gasta una vez.
//
// PURO: cero red, cero DB, cero IA.

import type { CardioVerdict } from './cardioWatch'

export type CardioCanal = 'ahora' | 'manana' | 'reporte' | 'nada'

export interface CardioAviso {
  canal: CardioCanal
  /** Título corto para el push (vacío en 'manana'/'reporte'). */
  titulo: string
  /** El cuerpo del mensaje, ya listo para enviar. */
  texto: string
  /**
   * Identidad ESTABLE del aviso, para no repetirlo. No lleva números ni fechas:
   * si mañana la VFC es 19 en vez de 18, sigue siendo el mismo aviso y no tiene
   * que sonar de nuevo. Mismo criterio que `topicKey` en el brief.
   */
  fingerprint: string
  /**
   * Si el aviso conviene acompañarlo del reporte para el médico. Solo cuando de
   * verdad va a haber una consulta — mandar un reporte clínico por una noche
   * floja es alarmar por nada.
   */
  conReporte: boolean
}

/** Días que un aviso 'ahora' no se repite. Vuelve a sonar si sigue vigente. */
export const SILENCIO_AHORA_DIAS = 2
/** Un aviso de nivel 'consultar' se puede repetir menos seguido: ya lo sabe. */
export const SILENCIO_CONSULTAR_DIAS = 7

/**
 * Decide el canal. El orden de las ramas ES la política, así que se lee de arriba
 * abajo: primero lo que interrumpe, después lo que espera.
 */
export function decidirCanal(v: CardioVerdict): CardioAviso {
  const nada: CardioAviso = { canal: 'nada', titulo: '', texto: '', fingerprint: '', conReporte: false }
  if (!v.text) return nada

  const tiene = (p: string) => v.findings.some((f) => f.pattern === p)

  // 1) AHORA — amerita especialista. Interrumpe porque hay algo que AGENDAR, y
  //    va con el reporte para que no tenga que pedirlo.
  if (v.level === 'consultar') {
    return {
      canal: 'ahora',
      titulo: '🫀 Algo en tus señales del corazón',
      texto: v.text,
      fingerprint: 'cardio:consultar',
      conReporte: true,
    }
  }

  // 2) AHORA — un día extremo. Interrumpe porque caduca hoy: sirve antes de que
  //    entrene, no en el brief de mañana. Sin reporte: no hay consulta acá.
  if (tiene('anomalia_aguda')) {
    return {
      canal: 'ahora',
      titulo: '🫀 Tu cuerpo quedó fuera de lo tuyo anoche',
      texto: v.text,
      fingerprint: 'cardio:aguda',
      conReporte: false,
    }
  }

  // 3) MAÑANA — la deriva de la línea base. Es de semanas: no hay ninguna razón
  //    para interrumpir, pero tampoco para enterrarla en una pantalla.
  if (tiene('deriva_de_linea_base')) {
    return { canal: 'manana', titulo: '', texto: v.text, fingerprint: 'cardio:deriva', conReporte: false }
  }

  // 4) MAÑANA — una racha sostenida que todavía es corta o está explicada.
  if (tiene('fc_elevada_sostenida') || tiene('vfc_deprimida_sostenida') || tiene('desacople_autonomico')) {
    return { canal: 'manana', titulo: '', texto: v.text, fingerprint: 'cardio:racha', conReporte: false }
  }

  // 5) MAÑANA — el eje respiratorio. Va con su propia frase ("no al corazón")
  //    ya armada en el finding, así que no se disfraza de cardíaco.
  if (tiene('senal_respiratoria')) {
    return { canal: 'manana', titulo: '', texto: v.text, fingerprint: 'cardio:respiratorio', conReporte: false }
  }

  // 6) REPORTE — "esto ya pasó y se acomodó solo". Es la buena noticia, y es
  //    justo lo que NO hay que empujar: no cambia nada de lo que va a hacer hoy,
  //    y si suena, la próxima vez que suene de verdad ya no le va a creer.
  return { canal: 'reporte', titulo: '', texto: v.text, fingerprint: 'cardio:recuperado', conReporte: false }
}

/**
 * ¿Se puede mandar este aviso, o ya sonó hace poco? PURA: la fecha del último
 * envío se le pasa; quién la guarda es problema del llamador.
 */
export function puedeAvisar(
  aviso: CardioAviso,
  ultimoEnvioISO: string | null,
  ahora: Date = new Date(),
): boolean {
  if (aviso.canal !== 'ahora') return false
  if (!ultimoEnvioISO) return true
  const t = Date.parse(ultimoEnvioISO)
  if (!Number.isFinite(t)) return true
  const dias = (ahora.getTime() - t) / 86_400_000
  const espera = aviso.fingerprint === 'cardio:consultar' ? SILENCIO_CONSULTAR_DIAS : SILENCIO_AHORA_DIAS
  return dias >= espera
}
