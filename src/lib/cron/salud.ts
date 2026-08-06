// SIR V2 — VIGILANTE de los trabajos automáticos. PURO.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// El 1-ago-2026, verificando, salió esto: `status-diff` —el motor que compara el
// estado de cada relación contra el del día anterior y es lo que debería avisar
// "Diana viene en tensión"— **se saltó el 26, el 30 y el 31 de julio sin que nadie
// se enterara**. Corrió el 29 y volvió el 1-ago. Nadie lo notó en 6 días.
//
// Y la causa no es lo interesante: lo interesante es que **no había forma de
// notarlo**. El cron puede fallar de al menos cuatro maneras distintas y todas se
// ven igual desde afuera:
//   1. Vercel no lo invoca (ventana de deploy, límite de plan).
//   2. La consulta falla y PostgREST NO lanza → `data` viene null → la ruta hace
//      `if (people.length === 0) return 200` y **reporta éxito habiendo hecho
//      nada**. Vercel lo pinta verde. [[postgrest-columna-inexistente]]
//   3. Falta una env var y sale por el 500 temprano.
//   4. Corre completo pero escribe cero.
//
// Este módulo es CAUSA-AGNÓSTICO a propósito: no pregunta por qué falló, mira si
// dejó EVIDENCIA. Es el mismo criterio de [[alarma-silencio-reader-apagada]] —
// data fresca es prueba de vida— y evita el candado circular de esa vez: el
// vigilante NO depende de los trabajos que vigila, lee su salida.
//
// ═══ LA REGLA DURA: "NO CORRIÓ" ≠ "NO LO PUEDO VERIFICAR" ═════════════════════
//
// CLAUDE.md lo prohíbe explícitamente: ningún bot de este repo puede concluir que
// algo no existe desde una vista parcial. Si la tabla de evidencia se renombró o
// la columna cambió, el vigilante tiene que decir *"no lo puedo verificar"*, nunca
// *"está caído"*. Una falsa alarma acá destruye su confianza en el vigilante, y un
// vigilante en el que no confía es peor que ninguno.
//
// PURO: cero red, cero DB. El "hoy" se inyecta.

/** Un trabajo cuya salida se puede verificar por evidencia. */
export interface TrabajoVigilado {
  /** Nombre del cron (la ruta), para el log. */
  job: string
  /** Cómo se lo nombra a Aaron: qué HACE, no cómo se llama el archivo. */
  etiqueta: string
  /** Cada cuántos días debería dejar evidencia. 1 = diario. */
  cadaDias: number
}

/** Lo que se midió en la base para ese trabajo. */
export interface EstadoDeTrabajo {
  job: string
  /** 'YYYY-MM-DD' del último día con evidencia. null = sin evidencia. */
  ultimoDia: string | null
  /**
   * ¿Se pudo mirar la evidencia? `false` cuando la consulta falló (tabla o
   * columna renombrada). Un trabajo NO verificable no se reporta como caído.
   */
  verificable: boolean
}

export interface Atraso {
  job: string
  etiqueta: string
  dias: number
}

const DAY = 86_400_000

/**
 * Trabajos vigilados. SOLO los que dejan evidencia INCONDICIONAL cada día.
 *
 * `moment-scan` u `opportunities` quedan fuera a propósito: hay días en que
 * legítimamente no encuentran nada, así que su silencio no prueba una falla y
 * vigilarlos daría falsas alarmas.
 */
export const VIGILADOS: readonly TrabajoVigilado[] = [
  { job: 'status-diff', etiqueta: 'el motor que vigila cómo viene cada relación', cadaDias: 1 },
  { job: 'morning-push', etiqueta: 'tu brief de la mañana', cadaDias: 1 },
  // ENTRA porque su evidencia SÍ es incondicional: el cierre del día (el 🌙) se
  // manda apenas la flag está activa, sin depender de que haya hábitos o tomas
  // pendientes. Lo que cuelga de ese cron sí es condicional —la toma de las
  // 22:00, el check-in, el "¿quién es quién?"— pero el brief no, así que su
  // ausencia en un día es prueba de que el cron no ejecutó.
  //
  // La noche del 5-ago-2026 no entregó NADA y se descubrió a las 04:00 a mano.
  // Con esta línea, el brief de la mañana lo habría dicho solo.
  { job: 'evening-push', etiqueta: 'el cierre de tu día por Telegram', cadaDias: 1 },
]

/** Días enteros entre dos 'YYYY-MM-DD'. null si alguna no parsea. PURA. */
function dias(desde: string, hasta: string): number | null {
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hasta}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / DAY)
}

/**
 * Trabajos que se pasaron de su ventana. PURO.
 *
 * La tolerancia es `cadaDias + 1`: un día perdido puede ser una ventana de deploy
 * (los crons se re-registran en cada despliegue a producción, y el 31-jul hubo 13
 * merges). Dos días seguidos ya es un patrón, no mala suerte.
 */
export function trabajosAtrasados(
  estados: readonly EstadoDeTrabajo[],
  hoy: string,
  vigilados: readonly TrabajoVigilado[] = VIGILADOS,
): Atraso[] {
  const out: Atraso[] = []
  for (const v of vigilados) {
    const e = (estados ?? []).find((x) => x?.job === v.job)
    // Sin medición o medición fallida → no se afirma nada. Va por `noVerificables`.
    if (!e || !e.verificable) continue
    if (!e.ultimoDia) {
      // Verificable y SIN evidencia alguna: eso sí es información.
      out.push({ job: v.job, etiqueta: v.etiqueta, dias: Infinity })
      continue
    }
    const d = dias(e.ultimoDia, hoy)
    if (d === null || d <= v.cadaDias) continue
    out.push({ job: v.job, etiqueta: v.etiqueta, dias: d })
  }
  return out.sort((a, b) => b.dias - a.dias)
}

/** Trabajos que NO se pudieron mirar. Se reportan aparte, nunca como caídos. PURA. */
export function noVerificables(
  estados: readonly EstadoDeTrabajo[],
  vigilados: readonly TrabajoVigilado[] = VIGILADOS,
): TrabajoVigilado[] {
  return vigilados.filter((v) => {
    const e = (estados ?? []).find((x) => x?.job === v.job)
    return !e || !e.verificable
  })
}

/**
 * La línea del brief. null si todo está al día. PURA.
 *
 * Habla de lo que el trabajo HACE, no del nombre del cron: a Aaron no le sirve
 * "status-diff falló", le sirve saber que el motor que le avisa de sus relaciones
 * estuvo mudo. Y separa el "no lo puedo verificar" del "no corrió".
 */
export function saludDeCronsLine(
  atrasados: readonly Atraso[],
  noVerif: readonly TrabajoVigilado[] = [],
): string | null {
  const partes: string[] = []
  for (const a of atrasados ?? []) {
    const cuando = a.dias === Infinity ? 'nunca dejó rastro' : `lleva ${a.dias} días sin correr`
    partes.push(`${a.etiqueta} ${cuando}`)
  }
  if (partes.length > 0) {
    return `🔧 Algo mío se quedó mudo: ${partes.join(' · ')}. Lo estoy mirando — no es data tuya que se haya perdido.`
  }
  if ((noVerif ?? []).length > 0) {
    // No se afirma que esté caído: se afirma que no se puede ver. Es distinto.
    return `🔧 No pude verificar si ${noVerif.map((v) => v.etiqueta).join(' ni ')} corrió. No digo que esté caído: digo que no lo veo.`
  }
  return null
}
