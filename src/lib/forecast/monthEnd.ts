// SIR V2 — Forecast: proyección de fin de mes (gasto), lógica pura.
//
// Predice cuánto vas a GASTAR al cierre del mes en curso a partir de lo que va
// del mes (run-rate), separando el gasto FIJO/recurrente —que ya está booked y
// NO se extrapola— del VARIABLE —que sí corre a ritmo diario. Extrapolar el
// total naïvemente sobreestima (contaría el alquiler una vez por día); por eso
// solo el variable se proyecta hacia los días que faltan.
//
// Honesto por diseño (principio SIR: "sin datos" ≠ "mal estado"): con pocos días
// o sin gastos, devuelve status 'insufficient' en vez de inventar un número. La
// confianza sube con los días transcurridos. Determinístico: `now` inyectable.
//
// NO extrapola INGRESOS (son lumpy: sueldo cae de golpe). El ingreso proyectado
// es el acumulado del mes — no asumimos plata que todavía no entró.

import type { FinancialMovement } from '@/types'

/** Salidas de dinero clasificables como "gasto" (igual criterio que el engine
 *  de intención). Transfer/investment quedan fuera del gasto proyectado. */
const OUTFLOW_TYPES: ReadonlySet<FinancialMovement['type']> = new Set(['expense', 'debt'])

/** Días mínimos transcurridos para que un run-rate signifique algo. */
const MIN_DAYS_ELAPSED = 4

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export type ForecastConfidence = 'low' | 'medium' | 'high'

export interface MonthEndSpendForecast {
  status: 'ok' | 'insufficient'
  /** Motivo cuando status='insufficient' (para una UI honesta). */
  reason?: string
  /** Mes en curso, ej. "julio". */
  monthLabel: string
  daysElapsed: number
  daysInMonth: number
  daysRemaining: number
  /** Gasto (expense+debt) acumulado del mes hasta hoy, PEN. */
  mtdOutflowPEN: number
  /** Parte recurrente/fija del MTD (ya booked, no se extrapola). */
  mtdRecurringPEN: number
  /** Parte variable del MTD (base del run-rate). */
  mtdVariablePEN: number
  /** Ritmo diario del gasto variable (mtdVariable / díasTranscurridos). */
  dailyVariablePEN: number
  /** Proyección de gasto total del mes: MTD + variableDiario × díasRestantes. */
  projectedOutflowPEN: number
  /** Ingreso acumulado del mes (NO extrapolado). */
  mtdIncomePEN: number
  /** Gasto total del mes ANTERIOR completo (baseline). null si no hubo data. */
  lastMonthOutflowPEN: number | null
  /** Proyectado vs mes pasado, en %. Positivo = gastas más. null sin baseline. */
  vsLastMonthPct: number | null
  confidence: ForecastConfidence
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Descompone una fecha date-only o ISO en {y, m, d} de calendario local. */
function ymd(iso: string): { y: number; m: number; d: number } | null {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m: m - 1, d }
}

/**
 * Proyecta el gasto de fin de mes del mes en curso a partir de los movimientos.
 * PURO — no toca red ni reloj salvo el `now` inyectado.
 */
export function projectMonthEndSpend(
  movements: FinancialMovement[],
  now: Date = new Date(),
): MonthEndSpendForecast {
  const y = now.getFullYear()
  const m = now.getMonth()
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const daysElapsed = now.getDate()
  const daysRemaining = daysInMonth - daysElapsed
  const monthLabel = MONTHS_ES[m]

  // Mes anterior (para el baseline de comparación).
  const prev = new Date(y, m - 1, 1)
  const prevY = prev.getFullYear()
  const prevM = prev.getMonth()

  let mtdOutflow = 0
  let mtdRecurring = 0
  let mtdVariable = 0
  let mtdIncome = 0
  let mtdOutflowCount = 0
  let lastMonthOutflow = 0
  let lastMonthHadData = false

  for (const mv of movements) {
    const p = ymd(mv.date)
    if (!p) continue
    const amt = Number.isFinite(mv.amountPEN) ? mv.amountPEN : 0

    // Mes anterior completo.
    if (p.y === prevY && p.m === prevM) {
      lastMonthHadData = true
      if (OUTFLOW_TYPES.has(mv.type)) lastMonthOutflow += amt
      continue
    }

    // Mes en curso, hasta hoy (excluye futuro-fechados: se cuentan cuando llega su día).
    if (p.y === y && p.m === m && p.d <= daysElapsed) {
      if (mv.type === 'income') {
        mtdIncome += amt
      } else if (OUTFLOW_TYPES.has(mv.type)) {
        mtdOutflow += amt
        mtdOutflowCount += 1
        if (mv.recurrent) mtdRecurring += amt
        else mtdVariable += amt
      }
    }
  }

  const dailyVariable = daysElapsed > 0 ? mtdVariable / daysElapsed : 0
  const projectedOutflow = mtdOutflow + dailyVariable * daysRemaining
  const lastMonthOutflowPEN = lastMonthHadData ? round2(lastMonthOutflow) : null
  const vsLastMonthPct =
    lastMonthOutflowPEN && lastMonthOutflowPEN > 0
      ? Math.round((projectedOutflow / lastMonthOutflowPEN - 1) * 100)
      : null

  // Confianza por fracción del mes transcurrida.
  const elapsedFrac = daysElapsed / daysInMonth
  const confidence: ForecastConfidence =
    elapsedFrac >= 0.5 ? 'high' : elapsedFrac >= 0.25 ? 'medium' : 'low'

  const base = {
    monthLabel,
    daysElapsed,
    daysInMonth,
    daysRemaining,
    mtdOutflowPEN: round2(mtdOutflow),
    mtdRecurringPEN: round2(mtdRecurring),
    mtdVariablePEN: round2(mtdVariable),
    dailyVariablePEN: round2(dailyVariable),
    projectedOutflowPEN: round2(projectedOutflow),
    mtdIncomePEN: round2(mtdIncome),
    lastMonthOutflowPEN,
    vsLastMonthPct,
    confidence,
  }

  // Estados insuficientes: honestos, no inventamos un número.
  if (daysRemaining <= 0) {
    return { ...base, status: 'insufficient', reason: 'El mes ya terminó — esto es el cierre real, no una proyección.' }
  }
  if (mtdOutflowCount === 0) {
    return { ...base, status: 'insufficient', reason: `Sin gastos registrados en ${monthLabel} todavía.` }
  }
  if (daysElapsed < MIN_DAYS_ELAPSED) {
    return { ...base, status: 'insufficient', reason: `Van ${daysElapsed} día${daysElapsed === 1 ? '' : 's'} de ${monthLabel} — necesito unos días más de gastos para proyectar con sentido.` }
  }

  return { ...base, status: 'ok' }
}
