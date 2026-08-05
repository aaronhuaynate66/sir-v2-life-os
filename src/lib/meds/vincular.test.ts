import { describe, expect, it } from 'vitest'

import { resolverItemPorNombre, type ItemVinculable } from './vincular'

/** El esquema real de Aaron al 5-ago-2026. */
const ITEMS: ItemVinculable[] = [
  { id: 'presci_neuro_topiramato', medName: 'Topiramato' },
  { id: 'presci_neuro_ergonex', medName: 'Ergonex Plus' },
  { id: 'presci_maxilo_orfenadrina', medName: 'Orfenadrina' },
  { id: 'presci_maxilo_etoricoxib', medName: 'Etoricoxib' },
  { id: 'presci_clona', medName: 'Clonazepam' },
]

describe('resolverItemPorNombre', () => {
  it('matchea el nombre tal cual', () => {
    expect(resolverItemPorNombre(ITEMS, 'Topiramato')).toBe('presci_neuro_topiramato')
  })

  it('no le importan mayúsculas, tildes ni espacios de más', () => {
    expect(resolverItemPorNombre(ITEMS, '  ORFENADRINA ')).toBe('presci_maxilo_orfenadrina')
    expect(resolverItemPorNombre(ITEMS, 'clonazépam')).toBe('presci_clona')
  })

  it('tolera la dosis pegada al nombre — el formulario es texto libre', () => {
    expect(resolverItemPorNombre(ITEMS, 'Topiramato 100 mg')).toBe('presci_neuro_topiramato')
    expect(resolverItemPorNombre(ITEMS, 'Etoricoxib 120mg')).toBe('presci_maxilo_etoricoxib')
  })

  it('matchea el nombre corto contra el largo de la receta', () => {
    expect(resolverItemPorNombre(ITEMS, 'Ergonex')).toBe('presci_neuro_ergonex')
  })

  it('NO matchea por el medio — un componente no es el medicamento', () => {
    // "Ergonex Plus" es ergotamina + cafeína. Que escriba "cafeína" no significa que
    // haya tomado el Ergonex.
    expect(resolverItemPorNombre(ITEMS, 'cafeina')).toBeNull()
  })

  it('ante ambigüedad devuelve null en vez de adivinar', () => {
    const ambiguos: ItemVinculable[] = [
      { id: 'a', medName: 'Topiramato' },
      { id: 'b', medName: 'Topiramato' }, // dos recetas con el mismo fármaco
    ]
    expect(resolverItemPorNombre(ambiguos, 'Topiramato')).toBeNull()
    expect(resolverItemPorNombre(ambiguos, 'Topiramato 50 mg')).toBeNull()
  })

  it('sin match devuelve null — la toma queda suelta, como antes', () => {
    expect(resolverItemPorNombre(ITEMS, 'Paracetamol')).toBeNull()
    expect(resolverItemPorNombre(ITEMS, '')).toBeNull()
    expect(resolverItemPorNombre([], 'Topiramato')).toBeNull()
  })

  it('ignora ítems con nombre vacío en vez de matchearlos con todo', () => {
    // Un medName vacío normaliza a '' y `'loquesea'.startsWith('')` es TRUE:
    // sin el filtro, una fila sucia se llevaría todas las tomas.
    const conBasura: ItemVinculable[] = [{ id: 'basura', medName: '   ' }, ...ITEMS]
    expect(resolverItemPorNombre(conBasura, 'Topiramato')).toBe('presci_neuro_topiramato')
  })
})
