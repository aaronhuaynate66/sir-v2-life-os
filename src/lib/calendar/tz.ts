// SIR V2 — TZ Lima (constante compartida).
//
// Perú (America/Lima) es UTC-5 FIJO: no observa horario de verano desde 1990.
// Por eso podemos tratar la conversión con un offset constante, sin una TZ
// database. Si algún día Perú reintrodujera DST, esto sería el único punto a
// tocar.

/** Horas que hay que SUMAR a un reloj local de Lima para obtener UTC. */
export const LIMA_UTC_OFFSET_HOURS = 5

/** Etiqueta corta para la UI. */
export const LIMA_TZ_LABEL = 'Lima (UTC-5)'
