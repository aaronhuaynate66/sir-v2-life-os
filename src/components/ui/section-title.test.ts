// SIR V2 — Tests de los niveles de SectionTitle.
//
// Aaron, 4-ago-2026, sobre /salud: "ha quedado horroroso, cero UX UI y orden".
// La causa medida no era el orden: era que la MISMA clase de 11 px gris se usaba
// como encabezado en 17 archivos, desde la métrica más importante hasta "Modelo de
// energía · experimental". Sin jerarquía el ojo no prioriza: promedia.
//
// Estos tests fijan que los tres niveles sean DE VERDAD distintos y que el default
// no cambie el look histórico — si alguien los aplana, el test lo dice.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const SRC = readFileSync('src/components/ui/section-title.tsx', 'utf8')

/** Extrae la línea del estilo de un nivel del mapa ESTILO. */
function estilo(nivel: string): string {
  const m = new RegExp(`${nivel}: \{[^}]*\}`).exec(SRC)
  return m ? m[0] : ''
}

describe('SectionTitle · los tres niveles son distinguibles', () => {
  it('los tres niveles existen', () => {
    for (const n of ['seccion', 'tarjeta', 'etiqueta']) {
      expect(estilo(n), `falta el nivel ${n}`).not.toBe('')
    }
  })

  it('cada nivel tiene un tamaño de texto DISTINTO (si no, no hay jerarquía)', () => {
    const tam = ['seccion', 'tarjeta', 'etiqueta'].map((n) => {
      const m = /text-(base|sm|xs|\[\d+px\])/.exec(estilo(n))
      return m ? m[1] : null
    })
    expect(tam).toEqual(['base', 'sm', '[11px]'])
    expect(new Set(tam).size).toBe(3)
  })

  it('solo el nivel de SECCIÓN usa el color de acento', () => {
    expect(estilo('seccion')).toContain('text-brand')
    expect(estilo('tarjeta')).not.toContain('text-brand')
    expect(estilo('etiqueta')).not.toContain('text-brand')
  })

  it('solo la ETIQUETA va en mayúsculas: un título en mayúsculas grita y no jerarquiza', () => {
    expect(estilo('etiqueta')).toContain('uppercase')
    expect(estilo('seccion')).not.toContain('uppercase')
    expect(estilo('tarjeta')).not.toContain('uppercase')
  })

  it('el DEFAULT sigue siendo etiqueta: los ~20 usos existentes no cambian de look', () => {
    expect(SRC).toMatch(/level = 'etiqueta'/)
  })

  it('el ícono crece con el nivel', () => {
    const px = (n: string) => Number(/icono: (\d+)/.exec(estilo(n))?.[1] ?? 0)
    expect(px('seccion')).toBeGreaterThan(px('tarjeta'))
    expect(px('tarjeta')).toBeGreaterThan(px('etiqueta'))
  })
})
