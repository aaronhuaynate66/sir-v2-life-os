import { describe, expect, it } from 'vitest'

import { debeAvisar } from './debeAvisar'

// Mismo orden que LABEL_RANK del cron: peor = más alto.
const RANK = { sin_data: 0, estable: 1, atencion: 2, en_tension: 3, critico: 4 }

describe('debeAvisar', () => {
  it('sin alertas vivas, avisa', () => {
    expect(debeAvisar([], 'en_tension', RANK)).toBe(true)
  })

  it('EL BUG: una alerta vieja dejaba a la persona muda para siempre', () => {
    // Medido el 5-ago-2026: 35 personas con una alerta sin descartar. Con la guarda
    // vieja, ninguna volvía a avisar aunque empeorara.
    const vivas = [{ to_label: 'atencion' }]
    expect(debeAvisar(vivas, 'en_tension', RANK)).toBe(true) // empeoró → SÍ avisa
    expect(debeAvisar(vivas, 'critico', RANK)).toBe(true)
  })

  it('no repite por el MISMO estado — eso sí sería ruido', () => {
    expect(debeAvisar([{ to_label: 'en_tension' }], 'en_tension', RANK)).toBe(false)
  })

  it('no avisa si ya hay una alerta por algo PEOR', () => {
    // Ya se le dijo "crítico"; que ahora caiga a "en tensión" no es noticia nueva.
    expect(debeAvisar([{ to_label: 'critico' }], 'en_tension', RANK)).toBe(false)
  })

  it('con varias vivas, manda la peor', () => {
    const vivas = [{ to_label: 'atencion' }, { to_label: 'critico' }, { to_label: 'estable' }]
    expect(debeAvisar(vivas, 'en_tension', RANK)).toBe(false)
    expect(debeAvisar(vivas, 'critico', RANK)).toBe(false)
  })

  it('ante una etiqueta que no sabe ordenar, se calla', () => {
    // No inventar una comparación: avisar por algo que no se sabe rankear es peor
    // que no avisar.
    expect(debeAvisar([{ to_label: 'atencion' }], 'inventada', RANK)).toBe(false)
    expect(debeAvisar([{ to_label: null }], 'en_tension', RANK)).toBe(false)
    expect(debeAvisar([{ to_label: 'rara' }], 'en_tension', RANK)).toBe(false)
  })

  it('el caso de Aaron: estable → atención → tensión, avisa DOS veces', () => {
    const vivas: Array<{ to_label: string }> = []
    expect(debeAvisar(vivas, 'atencion', RANK)).toBe(true)
    vivas.push({ to_label: 'atencion' })
    expect(debeAvisar(vivas, 'en_tension', RANK)).toBe(true) // con el bug: false
  })
})
