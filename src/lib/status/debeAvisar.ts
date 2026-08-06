// SIR V2 — ¿esta caída de estado es NUEVA, o ya se avisó? PURO.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// `status-diff` bloqueaba así (route.ts:141-145):
//
//     select id from person_status_alerts
//      where user_id=… and person_id=… and dismissed_at is null limit 1
//     if (existing.length === 0) { …crear alerta… }
//
// O sea: **UNA sola alerta sin descartar deja a esa persona muda para siempre.** No
// compara la transición — solo pregunta si hay algo abierto. Si Aaron nunca toca el
// botón de descartar (y no lo toca: medido el 5-ago-2026, **35 alertas vivas**), esa
// persona puede pasar de `estable` a `en_tension` y de ahí a lo que sea, y no vuelve
// a generar un aviso nunca.
//
// Mientras tanto el snapshot del día se sigue escribiendo, el cron devuelve 200 y todo
// parece sano. Es la razón por la que él dice que SIR no le avisa cuando el tono de
// alguien cambia: el motor lo detecta y se calla.
//
// ES LA MISMA FAMILIA QUE EL SILENCIO POR SLOT
// Una clave fija —acá "¿hay alerta viva para esta persona?"— no distingue "lo mismo
// otra vez" de "algo PEOR que antes". Lo que identifica el aviso tiene que ser el
// CONTENIDO (a qué estado cayó), no el contenedor. [[identidad-del-silencio-por-slot]]

/** Peor = número más alto. Mismo orden que `LABEL_RANK` en el cron. */
export type Etiqueta = string

export interface AlertaViva {
  /** El estado al que había caído cuando se avisó. */
  to_label: Etiqueta | null
}

/**
 * ¿Hay que avisar esta caída? PURA.
 *
 * Avisa cuando:
 *   · no hay ninguna alerta viva para esa persona, o
 *   · la caída de AHORA es a un estado PEOR que el de todas las alertas vivas.
 *
 * Calla cuando ya hay una alerta viva por ese mismo estado o por uno peor: ahí sí
 * repetir sería ruido, que es lo que la guarda original quería evitar — y hacía bien,
 * solo que con la pregunta equivocada.
 */
export function debeAvisar(
  vivas: readonly AlertaViva[],
  destino: Etiqueta,
  rank: Readonly<Record<string, number>>,
): boolean {
  if (vivas.length === 0) return true
  const rDestino = rank[destino]
  // Etiqueta desconocida: no se inventa una comparación, se calla (comportamiento
  // viejo). Avisar por algo que no se sabe ordenar sería peor que no avisar.
  if (rDestino === undefined) return false
  const peorAvisado = vivas.reduce((max, a) => {
    const r = a.to_label != null ? rank[a.to_label] : undefined
    return r !== undefined && r > max ? r : max
  }, -Infinity)
  // Si nunca se pudo leer el destino de ninguna viva, se cae al comportamiento
  // conservador: hay algo abierto y no se sabe qué, no se repite.
  if (peorAvisado === -Infinity) return false
  return rDestino > peorAvisado
}
