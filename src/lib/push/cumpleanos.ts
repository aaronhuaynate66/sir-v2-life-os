// SIR V2 — Cumpleaños próximos, de las DOS fuentes donde de verdad viven. PURO.
//
// ═══ EL AGUJERO, Y ES DE LOS PEORES ══════════════════════════════════════════
//
// Aaron, 31-jul-2026: *"hoy es cumpleaños de Alex y SIR brilló por su ausencia,
// pero POR QUÉ???"*.
//
// Porque el cumpleaños de Alex estaba cargado, en la persona correcta, marcado como
// recurrente… **en la columna que el brief no mira.**
//
// El brief tenía DOS caminos y el dato se caía entre los dos:
//   · `birthdays` ← salía SOLO de `people.birth_date`.
//   · `importantDates` ← salía de `people.special_dates`, y **descartaba
//     explícitamente** todo lo que dijera "cumple", con el comentario *"el cumple va
//     en birthdays"*.
//
// O sea: cada camino asumía que el otro se encargaba. Ninguno lo hacía.
//
// MEDIDO el 31-jul-2026 sobre su base real:
//   · **129 personas. Solo 3 con `birth_date`.**
//   · **21 cumpleaños viviendo solo en `special_dates` → invisibles.**
//   · Ese día había **DOS** cumpleaños: Alex Heilbrunn (importancia 9) y Walter
//     Heilbrunn (7). El brief no dijo ni uno.
//
// No es un caso borde: era la ruta por la que entraban CASI TODOS los cumpleaños.
//
// PURO: cero red, cero DB. El "hoy" se inyecta.

/** Fecha especial ya normalizada (mismo shape que `people.special_dates`). */
export interface FechaEspecial {
  date: string
  label: string
  recurring?: boolean
  cadence?: string | null
}

export interface PersonaConFechas {
  name: string
  birth_date: string | null
  fechas: FechaEspecial[]
  /** Para desempatar cuando hay varios el mismo día. */
  importance?: number | null
}

export interface CumpleProximo {
  name: string
  /** Días hasta el próximo (0 = hoy). */
  days: number
  /** De dónde salió — sirve para saber si hay que migrar la data. */
  fuente: 'birth_date' | 'special_dates'
}

const DAY = 86_400_000

/** Reconoce la etiqueta de un cumpleaños en español. PURA. */
export function esEtiquetaDeCumple(label: string | null | undefined): boolean {
  return /cumple|natalicio/i.test(label ?? '')
}

/**
 * Días hasta el próximo aniversario de una fecha (mes-día), ignorando el año.
 * PURA. null si la fecha no parsea.
 *
 * Se compara mes-día como texto y NO con `Date`: construir un Date con el año
 * actual y compararlo cruza husos y se corre un día. Este repo ya tuvo ese bug con
 * `personal_events` (ver `limaDayKey` en `estado-con-persona/insights`).
 */
export function diasHastaProximoAniversario(fecha: string | null | undefined, hoy: string): number | null {
  const f = (fecha ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(hoy)) return null
  const mdF = f.slice(5)
  const añoHoy = Number(hoy.slice(0, 4))
  // 29-feb en año no bisiesto: se cuenta el 1-mar para no perderlo.
  const candidatos = [`${añoHoy}-${mdF}`, `${añoHoy + 1}-${mdF}`]
  for (const c of candidatos) {
    const t = Date.parse(`${normalizar29Feb(c)}T00:00:00Z`)
    const h = Date.parse(`${hoy}T00:00:00Z`)
    if (!Number.isFinite(t) || !Number.isFinite(h)) return null
    const d = Math.round((t - h) / DAY)
    if (d >= 0) return d
  }
  return null
}

function normalizar29Feb(ymd: string): string {
  if (!ymd.endsWith('-02-29')) return ymd
  const y = Number(ymd.slice(0, 4))
  const bisiesto = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  return bisiesto ? ymd : `${y}-03-01`
}

/**
 * Cumpleaños dentro de la ventana, de `birth_date` **y** de `special_dates`. PURA.
 *
 * DEDUPE por persona: si alguien tiene el cumple en las dos fuentes (o dos veces en
 * `special_dates`, que pasa — Analia Cabrera y Adrian Prochazka tienen varias filas)
 * se queda UNA. Gana `birth_date` por ser el campo canónico.
 *
 * Ordena por cercanía y, a igual día, por importancia: con dos cumpleaños el mismo
 * día (pasó el 31-jul con los dos Heilbrunn) el de importancia 9 va primero.
 */
export function cumpleanosProximos(
  personas: readonly PersonaConFechas[],
  hoy: string,
  ventanaDias: number,
): CumpleProximo[] {
  const porNombre = new Map<string, CumpleProximo>()

  const considerar = (name: string, fecha: string | null | undefined, fuente: CumpleProximo['fuente']) => {
    const d = diasHastaProximoAniversario(fecha, hoy)
    if (d === null || d > ventanaDias) return
    const prev = porNombre.get(name)
    // `birth_date` manda sobre `special_dates`; entre iguales, el más cercano.
    if (prev && !(fuente === 'birth_date' && prev.fuente === 'special_dates') && prev.days <= d) return
    porNombre.set(name, { name, days: d, fuente })
  }

  for (const p of personas ?? []) {
    if (!p?.name) continue
    considerar(p.name, p.birth_date, 'birth_date')
    for (const f of p.fechas ?? []) {
      if (!esEtiquetaDeCumple(f?.label)) continue
      considerar(p.name, f?.date, 'special_dates')
    }
  }

  const imp = new Map((personas ?? []).map((p) => [p.name, p.importance ?? 0]))
  return [...porNombre.values()].sort((a, b) =>
    (a.days - b.days) || ((imp.get(b.name) ?? 0) - (imp.get(a.name) ?? 0)) || a.name.localeCompare(b.name))
}

/**
 * Días a los que SÍ vale avisar de una fecha que se acerca. PURA.
 *
 * ═══ POR QUÉ NO ES "TODOS LOS DÍAS DE LA VENTANA" ════════════════════════════
 *
 * Aaron, 31-jul-2026: *"hace tiempo te di fechas claves como mi aniversario con
 * Diana y mensario, justo con la intención de ANTICIPARME"*.
 *
 * Y la ventana de aniversarios era de **2 días**. Su aniversario del 13-ago se le
 * iba a avisar el 11: no alcanza para reservar, comprar nada ni mover la agenda.
 * Anticiparse era literalmente imposible.
 *
 * Pero ampliar la ventana sin más lo convierte en ruido: la misma línea diez días
 * seguidos, con el número bajando, es el muro del que ya se quejó (#1039) — y como
 * el texto cambia cada día, el dedupe por texto no lo agarra.
 *
 * Así que se avisa en HITOS: con 10 días (hay tiempo de planear algo), a la semana,
 * a 3 días (última llamada para comprar), y después cada día. Cuatro avisos
 * espaciados en vez de diez seguidos.
 */
export const HITOS_ANTICIPACION = [10, 7, 3, 2, 1, 0] as const

export function esHitoDeAnticipacion(days: number): boolean {
  return (HITOS_ANTICIPACION as readonly number[]).includes(days)
}
