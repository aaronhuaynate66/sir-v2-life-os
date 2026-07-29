import { describe, it, expect } from 'vitest'

import { clasificarCuenta, repartirLote } from './orgVerdict'
import type { ReaderProfile } from './igProfile'

const perfil = (p: Partial<ReaderProfile>): ReaderProfile => ({
  handle: 'x', fullName: null, category: null, followersCount: null,
  isBusiness: null, isVerified: null, avatarUrl: null, ...p,
} as ReaderProfile)

describe('clasificarCuenta — el perfil declarado manda', () => {
  it('cuenta profesional con rubro → organización, citando el rubro', () => {
    const v = clasificarCuenta({ handle: 'algo', perfil: perfil({ isBusiness: true, category: 'Restaurante' }) })
    expect(v.kind).toBe('org')
    expect(v.confianza).toBe('alta')
    expect(v.razon).toContain('Restaurante')
  })

  it('el perfil le GANA al handle: handle de persona pero IG dice empresa', () => {
    // Sin el perfil, "andysalcedovazq" se leería como persona. Con el perfil, no.
    const v = clasificarCuenta({ handle: 'andysalcedovazq', perfil: perfil({ isBusiness: true, category: 'Tienda' }) })
    expect(v.kind).toBe('org')
  })

  it('el perfil le GANA al handle también para decir PERSONA', () => {
    // "peru" al final diría organización; el perfil dice cuenta personal chica.
    const v = clasificarCuenta({ handle: 'juanchoperu', perfil: perfil({ isBusiness: false, followersCount: 300 }) })
    expect(v.kind).toBe('person')
    expect(v.confianza).toBe('alta')
  })

  it('muchos seguidores → organización aunque no declare rubro', () => {
    const v = clasificarCuenta({ handle: 'algo', perfil: perfil({ followersCount: 50_000 }) })
    expect(v.kind).toBe('org')
    expect(v.razon).toContain('50,000') // es-PE usa coma para los miles
  })
})

describe('clasificarCuenta — sin perfil, con el nombre que Aaron escribió', () => {
  it('un nombre de organización manda sobre el handle', () => {
    const v = clasificarCuenta({ handle: 'salamanca127', name: 'Bomberos Salamanca 127' })
    expect(v.kind).toBe('org')
  })

  it('un nombre INVÁLIDO (cortado) no decide: se cae al handle', () => {
    // "Impal" está cortado (← @impalaairguns). Antes de este módulo, un nombre así
    // podía terminar creando un contacto llamado "Impal".
    const v = clasificarCuenta({ handle: 'impalaairguns', name: 'Impal' })
    expect(v.kind).toBe('org')
    expect(v.razon).toContain('airguns')
  })
})

describe('clasificarCuenta — solo el handle (las 103 de la bandeja)', () => {
  it('pista fuerte → organización con alta confianza', () => {
    const v = clasificarCuenta({ handle: 'jimenezabogados.legal' })
    expect(v).toMatchObject({ kind: 'org', confianza: 'alta' })
  })

  it('pista débil → NO se afirma nada, queda en media', () => {
    const v = clasificarCuenta({ handle: 'mastermunozoficial' })
    expect(v.kind).toBe('unknown')
    expect(v.confianza).toBe('media')
  })

  it('sin pistas → unknown, nunca "persona" a la fuerza', () => {
    // Importa que NO diga 'person': afirmar que es un contacto personal sin
    // evidencia es tan falso como afirmar que es una empresa.
    const v = clasificarCuenta({ handle: 'alexbusev' })
    expect(v.kind).toBe('unknown')
  })
})

describe('repartirLote', () => {
  it('separa proponibles de preguntables y respeta el orden de entrada', () => {
    const { orgs, dudosas } = repartirLote([
      { handle: 'impalaairguns' },
      { handle: 'alexbusev' },
      { handle: 'johnholdenuniformes' },
      { handle: 'mastermunozoficial' },
    ])
    expect(orgs.map((o) => o.handle)).toEqual(['impalaairguns', 'johnholdenuniformes'])
    expect(dudosas.map((d) => d.handle)).toEqual(['alexbusev', 'mastermunozoficial'])
  })

  it('cada fila se lleva su razón, para poder mostrarla', () => {
    const { orgs } = repartirLote([{ handle: 'posrestaurante' }])
    expect(orgs[0].veredicto.razon).toContain('restaurante')
  })
})
