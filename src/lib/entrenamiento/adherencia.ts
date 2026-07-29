// SIR V2 — ¿Se está cumpliendo el plan de entrenamiento? PURO.
//
// El plan del Mundial pide, en el bloque de BASE, 3 sesiones de FUERZA por semana
// —es donde se gana el músculo que Aaron necesita para no caerse de la categoría
// 80+—. Contar "entrenamientos" a secas no sirve: tres sesiones de técnica no
// reemplazan a tres de fuerza.
//
// Esto mide la semana en curso contra lo que el bloque pide y lo dice sin
// regañar: el brief informa, no vigila.

export type TrainingKind = 'fuerza' | 'tecnica' | 'sparring' | 'acondicionamiento' | 'competencia' | 'otro'

export interface TrainingSession {
  /** Día de Lima YYYY-MM-DD. */
  date: string
  kind: TrainingKind
  durationMin?: number | null
}

export interface WeeklyTarget {
  /** Sesiones totales que pide el bloque. */
  total: number
  /** Sesiones de un tipo concreto (ej. 3 de fuerza en el bloque base). */
  ofKind?: { kind: TrainingKind; count: number }
}

export interface Adherence {
  /** Lunes de la semana en curso (YYYY-MM-DD). */
  weekStart: string
  done: number
  target: number
  /** Del tipo exigido, si el bloque exige uno. */
  doneOfKind: number | null
  targetOfKind: number | null
  kindLabel: TrainingKind | null
  /** Días que quedan en la semana, contando hoy. */
  daysLeft: number
  /** ¿Alcanza el objetivo si entrena todos los días que quedan? */
  reachable: boolean
}

/** Lunes de la semana de `day` (YYYY-MM-DD). PURA. */
export function weekStartOf(day: string): string {
  const t = Date.parse(`${day}T12:00:00Z`)
  if (!Number.isFinite(t)) return day
  const d = new Date(t)
  const dow = (d.getUTCDay() + 6) % 7 // 0 = lunes
  return new Date(t - dow * 86_400_000).toISOString().slice(0, 10)
}

/** Cuenta lo hecho esta semana contra lo que el bloque pide. PURA. */
export function weeklyAdherence(
  sessions: TrainingSession[],
  target: WeeklyTarget,
  todayKey: string,
): Adherence {
  const weekStart = weekStartOf(todayKey)
  const enSemana = sessions.filter((s) => s?.date >= weekStart && s.date <= todayKey)
  const done = enSemana.length
  const kind = target.ofKind?.kind ?? null
  const doneOfKind = kind ? enSemana.filter((s) => s.kind === kind).length : null
  const dow = (new Date(Date.parse(`${todayKey}T12:00:00Z`)).getUTCDay() + 6) % 7
  const daysLeft = 7 - dow // incluye hoy

  const faltaTotal = Math.max(0, target.total - done)
  const faltaKind = kind && target.ofKind ? Math.max(0, target.ofKind.count - (doneOfKind ?? 0)) : 0
  const reachable = Math.max(faltaTotal, faltaKind) <= daysLeft

  return {
    weekStart, done, target: target.total,
    doneOfKind, targetOfKind: target.ofKind?.count ?? null, kindLabel: kind,
    daysLeft, reachable,
  }
}

/**
 * Una línea para el brief. null cuando no hay nada que decir (ya cumplió, o es
 * lunes y aún no hay nada que reprochar). PURA. Informa, no regaña.
 */
/**
 * Reposo indicado por un médico que se solapa con la semana. Si hay, la adherencia
 * NO reclama: reclamarla es empujarlo contra la indicación médica.
 *
 * POR QUÉ EXISTE (29-jul-2026, y es el peor caso de la semana). Aaron terminó en
 * Emergencia el lunes 27 con traumatismo facial por una agresión, con **4 días de
 * descanso médico (27→30 jul)** y tramadol. El bloque 1 del Mundial —fuerza pesada
 * 3×/semana— arrancaba el 28. El brief del 29 le dijo: *"Entrenamiento: 0 de 3 de
 * fuerza · 0 de 4 en total. Quedan 5 días para cerrarla."*
 *
 * O sea: SIR lo apuró a levantar pesas al segundo día de un descanso médico por
 * golpes en la cara. Tenía la data del descanso en ninguna parte, pero el punto es
 * que un nudge de rendimiento **nunca** debe pasar por encima de un reposo indicado.
 */
export interface MedicalRest {
  /** YYYY-MM-DD inclusive. */
  from: string
  /** YYYY-MM-DD inclusive. */
  to: string
  reason?: string | null
}

/** ¿El reposo cubre alguno de los días de la semana en curso? PURO. */
export function restCoversWeek(rest: MedicalRest | null | undefined, weekStart: string, today: string): boolean {
  if (!rest?.from || !rest?.to) return false
  // Se solapan si el reposo no termina antes de que arranque la semana ni empieza
  // después de hoy (lo que viene después de hoy todavía no se reclama).
  return rest.to >= weekStart && rest.from <= today
}

export function adherenceLine(a: Adherence, rest?: MedicalRest | null, today?: string): string | null {
  // El reposo médico manda sobre cualquier meta de entrenamiento.
  if (rest && today && restCoversWeek(rest, a.weekStart, today)) {
    const enCurso = rest.to >= today
    return enCurso
      ? `Entrenamiento en pausa: estás con descanso médico hasta el ${rest.to}${rest.reason ? ` (${rest.reason})` : ''}. No cuento sesiones esta semana — cuando el médico te libere retomamos el bloque.`
      : `Esta semana la cruzó tu descanso médico (hasta el ${rest.to}), así que no la mido. Si ya te sientes bien, retomamos de a poco.`
  }

  const cumplioTotal = a.done >= a.target
  const cumplioKind = a.targetOfKind === null || (a.doneOfKind ?? 0) >= a.targetOfKind
  if (cumplioTotal && cumplioKind) {
    return a.done > 0 ? `Semana cumplida en entrenamiento: ${a.done} sesiones. Bien ahí.` : null
  }
  // Lunes/martes con poco hecho todavía no es noticia.
  if (a.daysLeft >= 6 && a.done === 0) return null

  const partes: string[] = []
  if (a.targetOfKind !== null && (a.doneOfKind ?? 0) < a.targetOfKind) {
    partes.push(`${a.doneOfKind ?? 0} de ${a.targetOfKind} de ${a.kindLabel}`)
  }
  if (!cumplioTotal) partes.push(`${a.done} de ${a.target} en total`)
  const estado = partes.join(' · ')

  if (!a.reachable) {
    return `Entrenamiento: ${estado}, y quedan ${a.daysLeft} día(s) — esta semana ya no sale completa. Apunta a cerrar lo de fuerza y arranca la próxima el lunes.`
  }
  return `Entrenamiento: ${estado}. Quedan ${a.daysLeft} día(s) para cerrarla.`
}
