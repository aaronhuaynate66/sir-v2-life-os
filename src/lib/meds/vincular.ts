// SIR V2 — Vincular una toma escrita a mano con el ítem de receta que le corresponde. PURO.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// Hay dos caminos para registrar una toma y NO son equivalentes:
//   · el botón de Telegram  → escribe `prescription_item_id`
//   · el formulario de /medicacion → NO lo escribía
//
// Y la adherencia se calcula filtrando por `prescription_item_id` (ver `medsDeLaToma`).
// O sea: una toma registrada desde la app **no contaba para nada**. No apagaba el botón
// de Telegram, no llenaba el conteo, no aparecía en la pauta. Quedaba como "toma suelta".
//
// Medido el 5-ago-2026 contra producción: **35 tomas registradas, 0 con
// `prescription_item_id`.** Con tres recetas activas encima. La adherencia de Aaron no
// se podía medir aunque él tocara el botón — es la clase de esfuerzo que se pide y
// después no se usa, que es peor que no pedirlo.
//
// ═══ ANTE LA DUDA, NO ADIVINAR ═══════════════════════════════════════════════
//
// Si el nombre matchea con más de un ítem, devuelve null y la toma queda suelta como
// antes. Vincularla mal sería peor: contaría una dosis de un fármaco que no tomó, y eso
// llega a una decisión médica.

export interface ItemVinculable {
  id: string
  medName: string
}

/** minúsculas, sin tildes, sin dobles espacios. PURA. */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * El id del ítem de receta que corresponde a `nombre`, o null si no hay match ÚNICO.
 *
 * Tolera que el usuario escriba la dosis pegada al nombre ("Topiramato 100 mg") o solo
 * la marca ("topiramato"), porque el formulario es texto libre y el botón de un toque
 * repite lo último que escribió.
 */
export function resolverItemPorNombre(items: ItemVinculable[], nombre: string): string | null {
  const n = normalizar(nombre)
  if (!n) return null

  const conNombre = items.map((i) => ({ id: i.id, med: normalizar(i.medName) })).filter((i) => i.med)

  // 1. Igual. Es el caso del botón de "lo de siempre".
  const exactos = conNombre.filter((i) => i.med === n)
  if (exactos.length === 1) return exactos[0].id
  if (exactos.length > 1) return null

  // 2. Uno contiene al otro por el PRINCIPIO: "Topiramato 100 mg" ↔ "Topiramato".
  //    Por el principio y no en cualquier posición, para que "cafeína" no matchee
  //    "Ergonex Plus (ergotamina + cafeína)".
  const porPrefijo = conNombre.filter((i) => n.startsWith(i.med) || i.med.startsWith(n))
  if (porPrefijo.length === 1) return porPrefijo[0].id

  // Ambiguo o sin match: queda suelta, igual que antes. No se inventa.
  return null
}
