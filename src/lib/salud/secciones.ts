// SIR V2 — El orden y la agrupación de /salud. PURO.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// Aaron, 4-ago: *"ha quedado horroroso, cero UX UI y orden"*. Se arregló la mitad
// (#1098, #1099) y quedaron ~20 tarjetas sueltas en una página de 523 líneas.
//
// El 5-ago, midiendo el inventario, apareció el diagnóstico real: **no sobran
// tarjetas, sobra fragmentación.** Ocho de las veinte responden UNA sola pregunta
// —¿cómo vengo durmiendo y cómo me deja eso hoy?— y estaban una debajo de otra:
// calidad, deuda, pronóstico, resaca, dos procesos, cronotipo, curva de energía y
// ventana de foco. Mientras tanto lo médico —lo que le importa esta semana, con un
// aneurisma y tres recetas activas— competía por espacio con el clima-humor.
//
// Él eligió AGRUPAR, no borrar: nada se pierde, se deja de ver todo a la vez.
//
// ═══ POR QUÉ ESTO ES UN MÓDULO Y NO JSX SUELTO ═══════════════════════════════
//
// Porque la decisión de qué va primero es del producto, no del que escribe el
// componente. Acá queda fijada y testeada; la página la consume. Si mañana alguien
// mete una tarjeta nueva, el test dice dónde va — en vez de que aterrice al final,
// que es exactamente cómo se llegó a las veinte.

export type ClaveSeccion = 'medico' | 'suenoEnergia' | 'cuerpo' | 'exploratorio'

export interface Seccion {
  clave: ClaveSeccion
  titulo: string
  /** Una línea que diga qué se responde acá. Sin esto un acordeón es una caja ciega. */
  subtitulo: string
  /** Componentes en orden, por su nombre exacto en `src/components/salud/`. */
  componentes: readonly string[]
  /** ¿Arranca abierta? Solo lo médico y el cuerpo; el resto se despliega si quiere. */
  abiertaPorDefecto: boolean
}

/**
 * El orden de la página, de arriba abajo.
 *
 * LO MÉDICO PRIMERO, y no es una preferencia estética: el 7-ago tiene el examen que
 * habilita el Mundial, tres recetas activas y seis lazos médicos abiertos. Lo que
 * está arriba es lo que se mira.
 */
export const SECCIONES: readonly Seccion[] = [
  {
    clave: 'medico',
    titulo: 'Lo médico',
    subtitulo: 'Qué tomas, qué falta cerrar y qué no subiste',
    componentes: ['MissingDataCard', 'TratamientosPanel', 'LazosMedicosPanel', 'ChequeosPanel', 'SintesisCruzadaPanel'],
    abiertaPorDefecto: true,
  },
  {
    clave: 'suenoEnergia',
    titulo: 'Sueño y energía',
    subtitulo: 'Cómo vienes durmiendo y cómo te deja eso hoy',
    // Las ocho que estaban sueltas. Juntas responden la misma pregunta; separadas
    // eran ocho respuestas parciales que había que integrar a mano.
    componentes: [
      'SleepDebtCard', 'SleepQualityCard', 'SleepForecastCard', 'SleepAftermathCard',
      'EnergyCurveCard', 'FocusWindowCard', 'ChronotypeCard', 'TwoProcessCard',
    ],
    abiertaPorDefecto: false,
  },
  {
    clave: 'cuerpo',
    titulo: 'Cuerpo',
    subtitulo: 'Peso, composición y corazón',
    componentes: ['BodyMetricsTrend', 'HeartRateAlertsPanel', 'PatronesPanel', 'MisCapturas'],
    abiertaPorDefecto: true,
  },
  {
    clave: 'exploratorio',
    titulo: 'Exploratorio',
    subtitulo: 'Correlaciones que todavía no se ganaron un lugar arriba',
    // No se borran —él pidió agrupar, no borrar— pero tampoco compiten con el
    // aneurisma por el primer scroll.
    componentes: ['WeatherMoodCard', 'EmotionWindowCard', 'LearningCard'],
    abiertaPorDefecto: false,
  },
]

/** Todos los componentes que la página debe montar, en orden de aparición. PURA. */
export function ordenDeMontaje(secciones: readonly Seccion[] = SECCIONES): string[] {
  return secciones.flatMap((s) => s.componentes)
}

/**
 * Componentes que están en el código de `/salud` y NO figuran en ninguna sección. PURA.
 *
 * Es el detector que evita volver a las veinte tarjetas: uno nuevo que nadie ubicó
 * aparece acá en vez de aterrizar al final de la página sin que nadie lo decida.
 */
export function sinUbicar(montadosEnLaPagina: readonly string[], secciones: readonly Seccion[] = SECCIONES): string[] {
  const ubicados = new Set(ordenDeMontaje(secciones))
  return montadosEnLaPagina.filter((c) => !ubicados.has(c))
}
