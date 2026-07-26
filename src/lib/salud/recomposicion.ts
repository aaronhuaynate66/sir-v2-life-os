// SIR V2 — Aritmética de RECOMPOSICIÓN corporal contra una categoría de peso. PURO.
//
// POR QUÉ (Aaron, 25-jul-2026): «¿por qué no me dice cómo subir masa muscular,
// si la balanza marca alto en grasa y los exámenes dicen lo mismo? No tiene
// sentido». Tenía razón: SIR guardaba composición corporal completa (grasa,
// masa magra, TMB, visceral) y tres laboratorios, y NADIE los cruzaba con su
// objetivo deportivo. El consejo que salía era "recompón", sin números.
//
// EL CONFLICTO REAL, en su caso: el médico dice "baja de peso" (IMC 27.4,
// cintura 103 cm), la balanza dice 25.2% de grasa, y su categoría exige NO bajar
// de 80 kg. Los tres tienen razón y parecen incompatibles. No lo son: lo que hay
// que mover es la COMPOSICIÓN, no el peso. Y eso se calcula.
//
// LÍMITE: esto es aritmética sobre datos que el usuario ya tiene, no consejo
// médico ni prescripción nutricional. Un perfil lipídico o hepático alterado va
// a un profesional; acá solo se dice qué implica el objetivo en kilos.

/** Lectura de composición corporal (de la báscula). */
export interface BodyComposition {
  weightKg: number
  bodyFatPercent: number
  /** Masa libre de grasa en kg, si la báscula la da. Si no, se deriva. */
  leanMassKg?: number | null
  /** Tasa metabólica basal (kcal/día), si está. */
  bmrKcal?: number | null
}

export interface RecompTarget {
  /** Peso mínimo a sostener (piso de categoría + margen). */
  minWeightKg: number
  /** % de grasa al que se quiere llegar. */
  targetFatPercent: number
  /** Semanas disponibles hasta el evento. */
  weeksAvailable: number
}

export interface RecompPlan {
  leanKg: number
  fatKg: number
  /** % de grasa MÍNIMO alcanzable sin ganar músculo, sosteniendo minWeightKg.
   *  Es el número que zanja la discusión: por debajo de esto no se puede bajar
   *  sin perder peso total. */
  floorFatPercentAtMinWeight: number
  /** Masa magra que haría falta para llegar al % objetivo SIN bajar de peso. */
  leanNeededKg: number
  /** Cuánto músculo hay que ganar (0 si ya alcanza). */
  muscleGapKg: number
  /** Ritmo necesario en kg de músculo por mes para llegar a tiempo. */
  neededMusclePerMonth: number | null
  /** ¿Es alcanzable en el plazo? Techo realista: 0.5 kg/mes en un atleta entrenado. */
  feasible: boolean
  /** Qué pasaría si baja la grasa SIN ganar músculo: peso resultante. */
  weightIfOnlyFatLoss: number
  /** Proteína diaria sugerida (g) — 2 g por kg de masa magra. */
  proteinGramsPerDay: number
  /** Calorías de mantenimiento estimadas (TMB × factor atleta 1.7), si hay TMB. */
  maintenanceKcal: number | null
}

/** Techo realista de ganancia muscular para alguien ya entrenado (kg/mes). */
export const REALISTIC_MUSCLE_GAIN_PER_MONTH = 0.5

/** Redondeo a 1 decimal. */
function r1(n: number): number {
  return Math.round(n * 10) / 10
}

/**
 * Traduce "quiero bajar grasa pero no puedo bajar de X kg" a kilos concretos.
 * PURA.
 */
export function computeRecomp(body: BodyComposition, target: RecompTarget): RecompPlan {
  const fatKg = body.weightKg * (body.bodyFatPercent / 100)
  const leanKg = body.leanMassKg ?? (body.weightKg - fatKg)

  // Si NO gana músculo y sostiene el peso mínimo, su grasa no puede bajar de acá.
  const floorFatPercentAtMinWeight = ((target.minWeightKg - leanKg) / target.minWeightKg) * 100

  // Para el % objetivo sosteniendo el peso mínimo, cuánta masa magra hace falta.
  const leanNeededKg = target.minWeightKg * (1 - target.targetFatPercent / 100)
  const muscleGapKg = Math.max(0, leanNeededKg - leanKg)

  const months = target.weeksAvailable / 4.345
  const neededMusclePerMonth = months > 0 ? muscleGapKg / months : null
  const feasible = neededMusclePerMonth === null
    ? false
    : neededMusclePerMonth <= REALISTIC_MUSCLE_GAIN_PER_MONTH

  // Si solo pierde grasa hasta el objetivo, sin tocar el magro.
  const weightIfOnlyFatLoss = leanKg / (1 - target.targetFatPercent / 100)

  return {
    leanKg: r1(leanKg),
    fatKg: r1(fatKg),
    floorFatPercentAtMinWeight: r1(floorFatPercentAtMinWeight),
    leanNeededKg: r1(leanNeededKg),
    muscleGapKg: r1(muscleGapKg),
    neededMusclePerMonth: neededMusclePerMonth === null ? null : r1(neededMusclePerMonth),
    feasible,
    weightIfOnlyFatLoss: r1(weightIfOnlyFatLoss),
    proteinGramsPerDay: Math.round(leanKg * 2),
    maintenanceKcal: body.bmrKcal ? Math.round(body.bmrKcal * 1.7) : null,
  }
}

/**
 * Lo que el objetivo implica, en castellano. Sin prescribir dieta ni
 * entrenamiento: dice la aritmética y qué es realista en el plazo. PURA.
 */
export function explainRecomp(plan: RecompPlan, target: RecompTarget, currentFatPercent: number): string[] {
  const out: string[] = []
  out.push(
    `Tienes ${plan.leanKg} kg de masa magra y ${plan.fatKg} kg de grasa (${r1(currentFatPercent)}%).`,
  )
  out.push(
    `Sosteniendo ${target.minWeightKg} kg, tu grasa no puede bajar de ${plan.floorFatPercentAtMinWeight}% sin ganar músculo: es aritmética, no disciplina.`,
  )
  if (plan.muscleGapKg > 0) {
    out.push(
      `Para llegar a ${target.targetFatPercent}% sin bajar de ${target.minWeightKg} kg necesitas ${plan.leanNeededKg} kg de magro — te faltan ${plan.muscleGapKg} kg de músculo.`,
    )
    if (plan.neededMusclePerMonth !== null) {
      out.push(
        plan.feasible
          ? `En ${target.weeksAvailable} semanas eso es ${plan.neededMusclePerMonth} kg/mes: alcanzable para alguien entrenado.`
          : `En ${target.weeksAvailable} semanas eso pide ${plan.neededMusclePerMonth} kg/mes, y el techo realista entrenado es ~${REALISTIC_MUSCLE_GAIN_PER_MONTH} kg/mes. No llegas: apunta a sostener el peso y ganar lo que se pueda.`,
      )
    }
  }
  out.push(
    `Si solo pierdes grasa sin tocar el músculo, terminas en ${plan.weightIfOnlyFatLoss} kg — por debajo de tu categoría.`,
  )
  out.push(
    plan.maintenanceKcal
      ? `Para sostenerlo: ~${plan.proteinGramsPerDay} g de proteína al día y comer alrededor de ${plan.maintenanceKcal} kcal (mantenimiento estimado), no por debajo.`
      : `Para sostenerlo: ~${plan.proteinGramsPerDay} g de proteína al día, sin déficit calórico agresivo.`,
  )
  return out
}

// ─── ¿Qué estás perdiendo (o ganando)? ──────────────────────────────────────
//
// Bajar de peso no dice nada por sí solo: importa SI ES GRASA O MÚSCULO. Con
// peso + %grasa de la misma báscula se separan las dos cosas. En el caso de
// Aaron, de los 800 g que bajó en 68 días, 350 g fueron masa magra (44%) — para
// alguien que necesita sostener categoría y ganar músculo, eso va al revés.

/** Lectura mínima para partir el cambio: día, peso y % de grasa. */
export interface CompositionPoint {
  day: string
  weightKg: number
  bodyFatPercent: number
}

export type CompositionVerdict =
  | 'recomponiendo'      // grasa abajo, magro arriba (o estable): lo ideal
  | 'perdiendo_musculo'  // el peso baja y buena parte es magro
  | 'ganando_magro'      // magro arriba
  | 'ganando_grasa'      // peso arriba y casi todo grasa
  | 'estable'            // nada se movió más que el ruido de la báscula

export interface CompositionChange {
  fromDay: string
  toDay: string
  days: number
  deltaWeightKg: number
  deltaFatKg: number
  deltaLeanKg: number
  /** Proporción del cambio total que fue grasa (0..1). null si no hubo cambio. */
  fatShare: number | null
  verdict: CompositionVerdict
}

/** Bajo esto es ruido de bioimpedancia, no una señal (±0.3 kg). */
const NOISE_KG = 0.3

/**
 * Parte el cambio de peso en grasa vs magro sobre la ventana pedida. PURA.
 * null si no hay al menos dos lecturas con ambos valores.
 */
export function partitionChange(points: CompositionPoint[], windowDays = 60, now?: Date): CompositionChange | null {
  const cutoff = (now ? now.getTime() : Date.now()) - windowDays * 86_400_000
  const pts = points
    .filter((p) => p && Number.isFinite(p.weightKg) && Number.isFinite(p.bodyFatPercent))
    .filter((p) => Date.parse(`${p.day}T12:00:00Z`) >= cutoff)
    .sort((a, b) => a.day.localeCompare(b.day))
  if (pts.length < 2) return null

  const calc = (p: CompositionPoint) => {
    const fat = p.weightKg * (p.bodyFatPercent / 100)
    return { fat, lean: p.weightKg - fat }
  }
  const a = pts[0], b = pts[pts.length - 1]
  const ca = calc(a), cb = calc(b)
  const deltaWeightKg = r1(b.weightKg - a.weightKg)
  const deltaFatKg = r1(cb.fat - ca.fat)
  const deltaLeanKg = r1(cb.lean - ca.lean)
  const magnitud = Math.abs(deltaFatKg) + Math.abs(deltaLeanKg)
  const fatShare = magnitud > 0 ? Math.round((Math.abs(deltaFatKg) / magnitud) * 100) / 100 : null

  let verdict: CompositionVerdict = 'estable'
  if (Math.abs(deltaFatKg) < NOISE_KG && Math.abs(deltaLeanKg) < NOISE_KG) verdict = 'estable'
  else if (deltaLeanKg <= -NOISE_KG) verdict = 'perdiendo_musculo'
  else if (deltaLeanKg >= NOISE_KG) verdict = deltaFatKg <= 0 ? 'recomponiendo' : 'ganando_magro'
  else verdict = deltaFatKg <= -NOISE_KG ? 'recomponiendo' : 'ganando_grasa'

  return {
    fromDay: a.day, toDay: b.day,
    days: Math.round((Date.parse(`${b.day}T12:00:00Z`) - Date.parse(`${a.day}T12:00:00Z`)) / 86_400_000),
    deltaWeightKg, deltaFatKg, deltaLeanKg, fatShare, verdict,
  }
}

/** Lo que ese cambio significa, en una línea. PURA. null si no hay nada que decir. */
export function explainComposition(c: CompositionChange | null): string | null {
  if (!c || c.verdict === 'estable') return null
  const signo = (n: number) => `${n > 0 ? '+' : ''}${n} kg`
  const base = `En ${c.days} días: peso ${signo(c.deltaWeightKg)}, grasa ${signo(c.deltaFatKg)}, músculo ${signo(c.deltaLeanKg)}.`
  switch (c.verdict) {
    case 'perdiendo_musculo': {
      const pct = c.fatShare !== null ? ` — el ${Math.round((1 - c.fatShare) * 100)}% de lo que bajaste fue magro` : ''
      return `${base}${pct}. Estás perdiendo músculo, no solo grasa: sube la proteína y mete fuerza pesada antes de recortar más comida.`
    }
    case 'recomponiendo':
      return `${base} Vas recomponiendo — grasa abajo y músculo firme. Es exactamente lo que buscas: sostenlo.`
    case 'ganando_magro':
      return `${base} Ganaste magro; parte del peso subió por eso, no todo es grasa.`
    case 'ganando_grasa':
      return `${base} La subida es casi toda grasa: revisa el superávit.`
    default:
      return base
  }
}

/** Una línea para el brief. PURA. */
export function recompBriefLine(plan: RecompPlan, target: RecompTarget): string {
  if (plan.muscleGapKg <= 0) {
    return `Composición al día: ${plan.leanKg} kg magros, ${plan.fatKg} kg de grasa. Sostén el peso y la proteína (~${plan.proteinGramsPerDay} g/día).`
  }
  const realismo = plan.feasible ? '' : ' (más de lo realista en el plazo — la meta acá es no perder magro)'
  return `Bajar grasa sin caerte de categoría pide GANAR ${plan.muscleGapKg} kg de músculo${realismo}: con ${plan.leanKg} kg de magro, sostener ${target.minWeightKg} kg te deja un piso de ${plan.floorFatPercentAtMinWeight}% de grasa. Come ~${plan.proteinGramsPerDay} g de proteína al día.`
}
