// SIR V2 — Detecta el compromiso de VERSE que quedó sin fecha. PURO.
//
// ═══ EL CASO QUE LO MOTIVA ════════════════════════════════════════════════════
//
// En la nota de Diana del 1-ago-2026 quedó guardado, textual:
//
//     Aaron: "fue un 4, hablamos bien y quedamos en vernos"
//
// Eso es un compromiso REAL y sin fecha, y es la conversación que venían
// postergando desde el cumpleaños de ella y que el 30-jul había terminado en pelea.
// Cinco días después seguía ahí, como texto libre dentro de una nota, sin que nada
// lo convirtiera en un plan.
//
// SIR tiene las DOS mitades y nunca las junta: sabe que lo prometió, y tiene los dos
// calendarios conectados, o sea que sabe cuándo está libre. Lo único que hacía era
// recitar el compromiso — que es exactamente lo que Aaron rechazó: *"no me dices qué
// hacer, esa información así vacía no me ayuda"*. Ver [[sir-computa-y-descarta]].
//
// ═══ POR QUÉ ES CONSERVADOR A PROPÓSITO ═══════════════════════════════════════
//
// Medido: en TODA su data hay **2** casos reales (Diana y Shian Navarro). O sea que
// esto no vale por volumen, vale por cuál es el caso — y entonces un falso positivo
// cuesta mucho más de lo que rinde un detectado extra. Una búsqueda floja de prueba
// ya marcó por error una nota de un cobro por Plin.
//
// Tres condiciones DURAS, todas necesarias:
//   1. Una expresión de ENCUENTRO MUTUO futuro (no cualquier verbo de contacto).
//   2. Sin ninguna marca de fecha u hora en el mismo fragmento.
//   3. Sin marca de pasado (si ya se vieron, no hay nada que agendar).
//
// Si hay duda, NO detecta. Un compromiso que se escapa lo vuelve a traer la próxima
// nota; una reunión inventada enseña a ignorar el aviso.

/** Normaliza para comparar: minúsculas, sin tildes, espacios colapsados. */
function norm(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Expresiones de ENCUENTRO MUTUO en futuro.
 *
 * Ojo con lo que NO está: "llamar", "escribirle", "conversar" y "hablar" quedaron
 * fuera a propósito. Son contacto, no encuentro, y proponer un hueco de agenda para
 * "hablar" convierte un mensaje de WhatsApp en una reunión que nadie pidió.
 */
const ENCUENTRO: readonly RegExp[] = [
  /\bquedamos en (vernos|juntarnos|reunirnos|encontrarnos|salir)\b/,
  /\b(vamos a|hay que|tenemos que|queremos) (vernos|juntarnos|reunirnos|encontrarnos)\b/,
  /\b(nos|lo|la) vemos\b/,
  /\bcoordinamos (para|y) (vernos|juntarnos|reunirnos|salir)\b/,
  /\bpendiente (de |)(vernos|juntarnos|reunirnos)\b/,
]

/**
 * Marcas de FECHA u HORA. Si aparece cualquiera, el compromiso ya está fechado (o
 * al menos referido a un día concreto) y no es asunto de este detector.
 *
 * Incluye los días de semana: "nos vemos los martes" es una rutina con día, no un
 * compromiso suelto.
 */
const TIENE_FECHA =
  /\b(\d{1,2}[-\/]\d{1,2}|\d{1,2} de (ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)|lunes|martes|miercoles|jueves|viernes|sabado|domingo|hoy|manana|pasado manana|proxima semana|este (finde|fin de semana)|fin de semana|a las \d{1,2}|\d{1,2}\s*(am|pm)|\d{1,2}:\d{2}|el \d{1,2}\b|(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)-\d{1,2}|\d{1,2}-(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic))/

/**
 * Marcas de PASADO. Si ya ocurrió, no hay nada que agendar.
 *
 * `vimos`/`juntamos`/`reunimos` en pretérito, y los adverbios de pasado que suelen
 * acompañarlos.
 */
const ES_PASADO = /\b(nos vimos|nos juntamos|nos reunimos|nos encontramos|ya nos vimos|ayer|anteayer|la semana pasada|el mes pasado|anoche)\b/

/**
 * Marcas de MISMO DÍA. Esto no es un compromiso abierto: es un "ahora".
 *
 * ═══ EL FALSO POSITIVO QUE LO MOTIVA ═════════════════════════════════════════
 * Encontrado el 6-ago-2026 corriendo el detector contra la data real —los tests
 * unitarios pasaban y esto solo apareció ahí—: en un log de hace **41 días** decía
 * *"Quedamos en vernos mas tarde"*. "Más tarde" era esa misma tarde; el compromiso
 * venció el mismo día. Proponer agendarlo 41 días después es exactamente el bug de
 * [[aviso-sin-fecha-se-lee-como-ahora]] al revés: tratar un "ahora" viejo como si
 * siguiera abierto.
 */
const ES_MISMO_DIA = /\b(mas tarde|mas tardecito|luego|al rato|en un rato|ahorita|ahora|en la noche|en la tarde|saliendo)\b/

export interface CompromisoSinFecha {
  /** El fragmento exacto donde está el compromiso, para poder citarlo. */
  frase: string
  /** Qué expresión lo disparó (para depurar y para los tests). */
  senal: string
}

/**
 * Busca en un texto un compromiso de verse SIN fecha. null si no hay. PURA.
 *
 * Trabaja por FRAGMENTOS (corta por punto, salto de línea, punto y coma y "y"
 * final de cláusula) porque las notas mezclan varias cosas en un párrafo: la de
 * Diana lleva la conversación, la calificación y el compromiso en la misma línea, y
 * la fecha de una parte no debe descalificar a la otra... pero la fecha del MISMO
 * fragmento sí. Ese es justo el borde que evita inventar reuniones.
 */
export function detectarCompromisoSinFecha(texto: string): CompromisoSinFecha | null {
  const bruto = (texto ?? '').trim()
  if (bruto.length === 0) return null
  // Se parte en fragmentos y se evalúa cada uno por separado.
  const fragmentos = bruto
    .split(/[.\n;·]|\s+\(|\)\s+/)
    .map((f) => f.trim())
    .filter((f) => f.length > 0)

  for (const frag of fragmentos) {
    const n = norm(frag)
    if (ES_PASADO.test(n)) continue
    if (TIENE_FECHA.test(n)) continue
    if (ES_MISMO_DIA.test(n)) continue
    for (const re of ENCUENTRO) {
      const m = n.match(re)
      if (m) return { frase: frag, senal: m[0] }
    }
  }
  return null
}
