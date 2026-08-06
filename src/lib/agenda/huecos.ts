// SIR V2 — Huecos libres de la agenda, para PROPONER un horario concreto. PURO.
//
// ═══ PARA QUÉ ═════════════════════════════════════════════════════════════════
//
// Un compromiso sin fecha ("quedamos en vernos") no se resuelve recitándolo: se
// resuelve proponiendo dos horarios que de verdad estén libres, para que se cierre
// con un toque. Es el mismo salto que dio el aviso de la medicación — el mensaje ya
// existía, lo que faltaba era poder cerrarlo desde ahí.
//
// PURO: recibe los eventos ya normalizados y el "ahora"; cero red, cero DB. Quien
// lee el calendario es `lib/calendar/feed`.
//
// ═══ HORA DE LIMA, OFFSET FIJO ────────────────────────────────────────────────
// Perú no tiene horario de verano, así que −05:00 es constante y se puede hacer
// aritmética sin librería de zonas. Es la misma convención del resto del repo
// (`limaDayString`). [[hora-de-lima-tz-no-funciona]]

const LIMA_OFFSET_MS = 5 * 3_600_000
const HORA_MS = 3_600_000

/** Evento ocupado, en el mínimo que hace falta acá. */
export interface EventoOcupado {
  start: string
  end?: string
  allDay: boolean
}

export interface Hueco {
  /** Inicio en ISO UTC. */
  inicio: string
  /** Fin en ISO UTC. */
  fin: string
  /** 'YYYY-MM-DD' del día de Lima al que pertenece. */
  diaLima: string
  /** Hora de Lima de inicio, 'HH:MM'. */
  horaLima: string
}

export interface OpcionesDeHueco {
  /** Cuántos días hacia adelante mirar. Default 7. */
  dias?: number
  /** Duración del encuentro en minutos. Default 90. */
  minutos?: number
  /** Cuántos huecos devolver como máximo. Default 2. */
  max?: number
}

/** Partes de una fecha en hora de Lima. */
function enLima(ms: number): { dia: string; hora: number; diaSemana: number } {
  const d = new Date(ms - LIMA_OFFSET_MS)
  return {
    dia: d.toISOString().slice(0, 10),
    hora: d.getUTCHours(),
    // 0 = domingo … 6 = sábado
    diaSemana: d.getUTCDay(),
  }
}

/** ms UTC del día de Lima `dia` a la hora de Lima `hora`. */
function desdeLima(dia: string, hora: number): number {
  return Date.parse(`${dia}T00:00:00Z`) + hora * HORA_MS + LIMA_OFFSET_MS
}

/**
 * Franjas en las que tiene sentido proponer un encuentro, por día de la semana.
 *
 * No es una preferencia inventada: proponerle a alguien un café un martes a las
 * 09:00 es proponerle que falte al trabajo. Entre semana solo la noche; el fin de
 * semana, mediodía y tarde.
 */
function franjasDe(diaSemana: number): Array<[number, number]> {
  const finDeSemana = diaSemana === 0 || diaSemana === 6
  return finDeSemana ? [[11, 13], [16, 20]] : [[19, 22]]
}

/** Intervalos ocupados en ms, a partir de los eventos. */
function ocupados(eventos: readonly EventoOcupado[]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const e of eventos ?? []) {
    if (!e || typeof e.start !== 'string') continue
    // ═══ LOS EVENTOS DE TODO EL DÍA NO BLOQUEAN ═══════════════════════════════
    //
    // En esta agenda los `allDay` son MARCADORES: aniversarios, cumpleaños, "visa
    // saudí límite 30-sep". Tratarlos como ocupado se comería todos los candidatos
    // del día por un recordatorio que no ocupa tiempo real. Un feriado mal leído
    // como libre solo produce una propuesta que él rechaza; un día entero borrado
    // por un cumpleaños produce que no haya propuesta nunca.
    if (e.allDay) continue
    const ini = Date.parse(e.start)
    if (!Number.isFinite(ini)) continue
    const finRaw = e.end ? Date.parse(e.end) : NaN
    // Sin fin declarado se asume una hora: es lo que hace el resto del repo al
    // pintar bloques, y subestimar acá propondría encima de algo que sí ocupa.
    const fin = Number.isFinite(finRaw) && finRaw > ini ? finRaw : ini + HORA_MS
    out.push([ini, fin])
  }
  return out.sort((a, b) => a[0] - b[0])
}

const choca = (ini: number, fin: number, ocup: Array<[number, number]>): boolean =>
  ocup.some(([a, b]) => ini < b && a < fin)

/**
 * Huecos libres para un encuentro, dentro de las franjas razonables. PURA.
 *
 * Devuelve **como máximo uno por día** y hasta `max` en total: proponer tres
 * horarios del mismo jueves no es dar opciones, es dar el jueves. Empieza a mirar
 * desde MAÑANA — un compromiso pendiente hace días no se resuelve proponiendo algo
 * para dentro de dos horas.
 *
 * Si devuelve `[]` el llamador NO debe concluir "no tiene tiempo": puede ser que la
 * agenda no se pudo leer. Esa diferencia la resuelve quien llama (y por eso el
 * mensaje degrada a preguntar el día).
 */
export function huecosLibres(
  eventos: readonly EventoOcupado[],
  nowMs: number,
  opciones: OpcionesDeHueco = {},
): Hueco[] {
  const dias = Math.max(1, opciones.dias ?? 7)
  const minutos = Math.max(15, opciones.minutos ?? 90)
  const max = Math.max(1, opciones.max ?? 2)
  const duracion = minutos * 60_000
  const ocup = ocupados(eventos)
  const hoy = enLima(nowMs).dia
  const out: Hueco[] = []

  for (let i = 1; i <= dias && out.length < max; i++) {
    const diaMs = Date.parse(`${hoy}T00:00:00Z`) + i * 86_400_000
    const dia = new Date(diaMs).toISOString().slice(0, 10)
    const diaSemana = new Date(diaMs).getUTCDay()
    for (const [desde, hasta] of franjasDe(diaSemana)) {
      let encontrado = false
      // Se avanza de media hora en media hora dentro de la franja.
      for (let h = desde; h + minutos / 60 <= hasta; h += 0.5) {
        const ini = desdeLima(dia, h)
        if (ini <= nowMs) continue
        if (choca(ini, ini + duracion, ocup)) continue
        const l = enLima(ini)
        out.push({
          inicio: new Date(ini).toISOString(),
          fin: new Date(ini + duracion).toISOString(),
          diaLima: l.dia,
          horaLima: `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 === 0 ? '00' : '30'}`,
        })
        encontrado = true
        break
      }
      // Uno por día: si ya salió en la primera franja, no se busca en la segunda.
      if (encontrado) break
    }
  }
  return out.slice(0, max)
}
