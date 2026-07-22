import { describe, it, expect } from 'vitest'
import { looksLikeBusiness } from './looksLikeBusiness'

describe('looksLikeBusiness', () => {
  it('marca cuentas de negocio (ejemplos reales de la bandeja)', () => {
    for (const h of ['johnholdenuniformes', 'corporacionaxion', 'jak_gear', 'limagrupoinmobiliario', 'maquilaperu', 'beework.peru', 'gato.pe_']) {
      expect(looksLikeBusiness({ handle: h, name: null }), h).toBe(true)
    }
  })

  it('NO marca personas (aunque no tengan nombre capturado)', () => {
    for (const h of ['fiorellanicolini', 'yoshuaandreruizarguedas', 'andeerley', 'rodrigo12980', 'analiahuaynate', 'fergu_fgh', 'dmedina']) {
      expect(looksLikeBusiness({ handle: h, name: null }), h).toBe(false)
    }
  })

  it('un nombre propio completo protege aunque el handle suene a marca', () => {
    // Persona real cuyo handle trae "peru" pero SÍ tiene nombre completo → no se marca.
    expect(looksLikeBusiness({ handle: 'juanperez.peru', name: 'Juan Pérez' })).toBe(false)
  })

  it('palabra clave de negocio marca aunque haya nombre', () => {
    expect(looksLikeBusiness({ handle: 'clinicadental', name: 'Clínica Dental Sonríe' })).toBe(true)
  })
})
