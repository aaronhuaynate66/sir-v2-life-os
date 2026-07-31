// SIR V2 — Patrones de laboratorio: lo consistente en el tiempo NO va "al baúl"
// (idea de Aaron, 17/07). Convierte una tendencia CONSISTENTE (mismo analito
// moviéndose siempre en la misma dirección a través de varios exámenes) en un
// aviso que vale la pena vigilar — sobre todo si va camino a salirse de rango o
// ya se salió. PURO — deriva de buildLabTrends. Testeable.

import type { HealthExam } from './types'
import { buildLabTrends, type LabTrend } from './trend'

export type PatternSeverity = 'alert' | 'watch'

export interface LabPattern {
  name: string
  unit?: string
  range?: string
  direction: 'up' | 'down'
  /** Valores en orden (para el texto: 16.8 → 14.5 → 13.9). */
  values: string[]
  severity: PatternSeverity
  /**
   * Cambio RELATIVO del primer al último valor numérico, en % (negativo = bajando).
   * null si no se puede calcular (primer valor 0 o no numérico).
   *
   * Existe porque la severidad sola no alcanza: dice SI se salió de rango, no CUÁNTO
   * se movió. Es la misma corrección que #1018 le hizo a la alerta de vitales, que
   * "contaba cuántas señales se salían del rango, no cuánto ni desde cuándo".
   */
  deltaPct: number | null
  /** El último valor quedó pegado al borde del rango hacia el que se mueve. */
  nearEdge: boolean
  /** Frase lista para mostrar. */
  message: string
  /** Ventana temporal del patrón (fecha del 1er y último examen medido) — para
   *  cruzarlo con la salud diaria en ese período (crossHealth, #7). YYYY-MM-DD. */
  from: string
  to: string
}

function cleanNum(v: string): number | null {
  return /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null
}

/**
 * Cuánto se movió la serie, en % del primer valor. PURA.
 * null si el primer valor es 0 (no hay % posible) o si faltan números.
 */
function driftPct(nums: readonly number[]): number | null {
  if (nums.length < 2) return null
  const a = nums[0], b = nums[nums.length - 1]
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null
  return ((b - a) / Math.abs(a)) * 100
}

/**
 * Parsea el rango de referencia tal como lo escriben los laboratorios peruanos.
 * Formatos reales vistos en la data: "13 – 19 (♂)", "150 – 450", "< 200",
 * "> 40 (♂)", "18.5 – 24.9", "0 – 43". Ojo con el GUION LARGO (–), que es el que
 * usan de verdad; aceptar solo "-" hacía que ningún rango parseara. PURA.
 */
export function parseRange(range: string | undefined): { min: number | null; max: number | null } {
  const s = (range ?? '').replace(/[^\d.,<>=\-–~a-zA-Z ]/g, ' ').trim()
  if (!s) return { min: null, max: null }
  const par = s.match(/(-?\d+(?:\.\d+)?)\s*[–\-~]\s*(-?\d+(?:\.\d+)?)/)
  if (par) return { min: Number(par[1]), max: Number(par[2]) }
  const menor = s.match(/^[<≤]\s*(-?\d+(?:\.\d+)?)/)
  if (menor) return { min: null, max: Number(menor[1]) }
  const mayor = s.match(/^[>≥]\s*(-?\d+(?:\.\d+)?)/)
  if (mayor) return { min: Number(mayor[1]), max: null }
  return { min: null, max: null }
}

/** Fracción del ancho del rango que se considera "pegado al borde". */
const MARGEN_BORDE = 0.2

/**
 * ¿El último valor quedó contra el borde al que se dirige? PURA.
 *
 * Solo mira el borde del lado HACIA el que se mueve: una hemoglobina que baja se
 * evalúa contra el mínimo, no contra el máximo. Sin eso, cualquier valor cerca de
 * cualquier extremo daría verdadero y se volvería ruido.
 */
function pegadoAlBorde(ultimo: number, direction: 'up' | 'down', range: string | undefined): boolean {
  const { min, max } = parseRange(range)
  if (min === null || max === null) return false
  const ancho = max - min
  if (!(ancho > 0)) return false
  const margen = ancho * MARGEN_BORDE
  return direction === 'down' ? ultimo - min <= margen : max - ultimo <= margen
}

/**
 * Detecta patrones dignos de vigilar: analitos con tendencia CONSISTENTE
 * (≥3 mediciones monótonas). 'alert' si el último valor está fuera de rango
 * (la tendencia lo sacó o lo aleja); 'watch' si sigue dentro pero se mueve
 * sostenido. Ordena alerts primero. PURO.
 */
export function labPatterns(exams: HealthExam[]): LabPattern[] {
  const { byCategory } = buildLabTrends(exams)
  const trends: LabTrend[] = byCategory.flatMap((c) => c.trends)
  const out: LabPattern[] = []
  for (const t of trends) {
    if (!t.consistent || (t.direction !== 'up' && t.direction !== 'down')) continue
    const pts = t.points.filter((p): p is NonNullable<typeof p> => !!p)
    const values = pts.map((p) => p.value)
    const nums = values.map(cleanNum).filter((n): n is number => n !== null)
    if (nums.length < 3) continue
    const last = pts[pts.length - 1]
    const outOfRange = last.flag === 'high' || last.flag === 'low'
    const dirWord = t.direction === 'up' ? 'subiendo' : 'bajando'
    const severity: PatternSeverity = outOfRange ? 'alert' : 'watch'
    const rangeTxt = t.range ? ` (rango ${t.range})` : ''
    const tail = outOfRange
      ? `y el último ya está fuera de rango${rangeTxt} — conviene revisarlo`
      : `— dentro de rango${rangeTxt}, pero vigílalo`
    const deltaPct = driftPct(nums)
    const nearEdge = pegadoAlBorde(nums[nums.length - 1], t.direction, t.range)
    out.push({
      name: t.name, unit: t.unit, range: t.range, direction: t.direction, values, severity,
      deltaPct: deltaPct === null ? null : Math.round(deltaPct * 10) / 10,
      nearEdge,
      message: `${t.name} viene ${dirWord} ${nums.length} exámenes seguidos (${values.join(' → ')}${t.unit ? ' ' + t.unit : ''}) ${tail}.`,
      from: pts[0].date, to: last.date,
    })
  }
  // alerts primero, luego watch
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'alert' ? -1 : 1))
}

/** Deriva de %: por debajo de esto, un 'watch' se queda en el panel. */
export const DERIVA_EMPUJABLE_PCT = 15

/**
 * ¿Este patrón merece un empujón proactivo, aunque siga "dentro de rango"? PURA.
 *
 * ═══ POR QUÉ NO ALCANZA CON `severity === 'alert'` ═══════════════════════════
 *
 * Antes esta línea solo salía si el ÚLTIMO valor ya estaba fuera de rango. Y eso
 * dejó pasar el caso más claro que tiene Aaron, encontrado el 31-jul-2026 al leer
 * sus 4 exámenes JUNTOS por primera vez:
 *
 *   Hemoglobina  16.8 → 14.5 → 13.9 g/dl  (may → may → jul), rango 13 – 19
 *   Hematocrito    52 → 44 → 41 %
 *
 * Una caída MONÓTONA del 17 % en dos meses, en un atleta que compite en noviembre.
 * El motor la detectaba perfecto — `consistent = true` — y como 13.9 sigue "dentro
 * de rango" quedaba en 'watch' y se descartaba. **Ninguno de los tres informes la
 * vio tampoco**, porque cada laboratorio leyó solo su propia planilla y en cada una
 * el valor estaba en verde. El patrón solo existe en la unión de los tres.
 *
 * (Detalle que lo dice todo: el ejemplo del comentario de `values`, más arriba en
 * este mismo archivo, es "16.8 → 14.5 → 13.9". Alguien escribió sus números como
 * ejemplo de formato y el push seguía tirándolos.)
 *
 * Es la misma corrección de #1018 a la alerta de vitales: **contaba cuántas señales
 * se salían del rango, no CUÁNTO se movieron.** Un valor en verde que se movió 17 %
 * de forma sostenida importa más que uno que roza el borde por casualidad.
 *
 * Dos vías, aparte del 'alert':
 *  · deriva ≥ 15 % — magnitud, independiente del rango.
 *  · pegado al borde al que se dirige — el próximo examen lo saca.
 *
 * Los umbrales son un juicio declarado, no una constante sagrada: se eligieron para
 * que el caso real de la hemoglobina (−17,3 %) entre y para que un vaivén de 5 % no.
 */
export function meritaEmpujon(p: LabPattern): boolean {
  if (p.severity === 'alert') return true
  if (p.deltaPct !== null && Math.abs(p.deltaPct) >= DERIVA_EMPUJABLE_PCT) return true
  return p.nearEdge
}

/**
 * Línea compacta para el brief/push matutino, o null si no hay nada que empujar.
 * Prioriza el 'alert'; si no hay, el 'watch' que más se movió. PURA.
 *
 * Es "que no se quede al baúl" (idea de Aaron) hecho recordatorio.
 */
export function labAlertPushLine(patterns: LabPattern[]): string | null {
  const candidatos = patterns.filter(meritaEmpujon)
  if (candidatos.length === 0) return null
  // `labPatterns` ya ordena alerts primero; entre los que quedan, el de mayor deriva.
  const elegido = candidatos.find((p) => p.severity === 'alert')
    ?? candidatos.slice().sort((a, b) => Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0))[0]
  const dir = elegido.direction === 'up' ? 'subiendo' : 'bajando'
  const n = elegido.values.length
  if (elegido.severity === 'alert') {
    return `Chequeo · ${elegido.name} viene ${dir} ${n} exámenes seguidos y salió de rango — conviene revisarlo`
  }
  // Se dice el CUÁNTO y que sigue en rango: sin eso suena a alarma y no lo es.
  const cuanto = elegido.deltaPct !== null ? ` (${elegido.deltaPct > 0 ? '+' : ''}${elegido.deltaPct} %)` : ''
  const porque = elegido.nearEdge && !(elegido.deltaPct !== null && Math.abs(elegido.deltaPct) >= DERIVA_EMPUJABLE_PCT)
    ? 'y quedó pegado al borde del rango'
    : 'y aunque sigue en rango, es harta deriva'
  return `Chequeo · ${elegido.name} viene ${dir} ${n} exámenes seguidos${cuanto} ${porque} — vale preguntarlo`
}
