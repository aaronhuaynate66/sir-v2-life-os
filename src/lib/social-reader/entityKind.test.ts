import { describe, it, expect } from 'vitest'
import { classifyEntity, looksTruncated, orgSlug, inferParentOrg } from './entityKind'

describe('classifyEntity — casos REALES del Excel que llenó Aaron', () => {
  it('la unidad de bomberos es ORG, no un contacto', () => {
    const v = classifyEntity('Bomberos Salamanca 127', 'bomberos.salamanca127', 'Es mi unidad de bomberos')
    expect(v.kind).toBe('org')
  })

  it('otras organizaciones del mismo llenado', () => {
    const casos: Array<[string, string, string]> = [
      ['Bomberos Ate 169', 'bomberosb169', ''],
      ['Juegos Latinoamericanos de Policias y Bomberos', 'jlapyb', ''],
      ['Grupo Herber', 'grupoherber', 'Centro de entrenamiento para bomberos en peru'],
      ['Quick Eat Peru', 'quickeatperu', 'Si'],
      ['Siberianos Lima Club', 'siberianoslimaclub', 'Si'],
      ['Bazar Nelly', 'bazar_nelly', 'Si'],
      ['Daedo Peru', 'daedoperu', 'Si'],
    ]
    for (const [name, handle, note] of casos) {
      expect(classifyEntity(name, handle, note).kind, name).toBe('org')
    }
  })

  it('las personas siguen siendo personas', () => {
    const casos: Array<[string, string]> = [
      ['Raquel Flores', 'raquel.2flores'],
      ['Daniel Francia', 'dan.francia.76'],
      ['Antonella Arrarte', 'antonellaarrarte'],
      ['Giancarlo Montaldo', 'tiocharlype'],
      ['Kirenia Blas', 'waikikiloco'],
      ['Valeria Espinosa Cano', 'vespinosa18'],
      ['Carmela de la Barra', 'delabarrita.spam'],
    ]
    for (const [name, handle] of casos) {
      expect(classifyEntity(name, handle).kind, name).toBe('person')
    }
  })

  it('"Si" no es un nombre — atajado antes de crear el contacto', () => {
    const v = classifyEntity('Si', 'dannaveronicaperea')
    expect(v.kind).toBe('invalid')
    expect(v.reason).toMatch(/respuesta/)
  })

  it('los nombres cortados a 5 letras se atajan', () => {
    for (const [name, handle] of [
      ['Impal', 'impalaairguns'], ['Ecofl', 'ecoflow_market_peru'],
      ['Comun', 'comunidadtls'], ['Ivcdl', 'ivcdlc_oficial'],
      ['Yayoc', 'yayocastaneda.pe'], ['Giviv', 'givivisfotos'], ['Cande', 'candelaperu.pe'],
    ] as Array<[string, string]>) {
      const v = classifyEntity(name, handle)
      expect(v.kind, name).toBe('invalid')
      expect(v.reason, name).toMatch(/cortado/)
    }
  })

  it('pero un nombre corto LEGÍTIMO no se marca como cortado', () => {
    // "Amy" para @amyst02: el handle apenas es 2 más largo → es un nombre, no un corte.
    expect(classifyEntity('Amy', 'amyst02').kind).toBe('person')
    expect(classifyEntity('Diego', 'diegojmo15').kind).toBe('person')
  })

  // REGRESIÓN de dos errores reales: la nota decía la PROFESIÓN de la persona y
  // eso los convertía en organizaciones.
  it('una nota que describe a una persona VETA la clasificación de org', () => {
    const giancarlo = classifyEntity(
      'Giancarlo Montaldo', 'tiocharlype',
      'Exalumno mio en toulouse y ahora inlfuencer, trabaja en una productora llamada alcance',
    )
    expect(giancarlo.kind).toBe('person')

    const ampuero = classifyEntity(
      'Carlos Ampuero', 'carlosampuerooficial',
      'Influencer sobre temas belicos y militares del sector defensa, exoficial del ejercito peruano y de usa',
    )
    expect(ampuero.kind).toBe('person')
  })

  it('pero "es mi unidad de bomberos" SIGUE siendo organización', () => {
    // El veto de persona no debe tragarse las orgs que él describió como tales.
    expect(classifyEntity('Bomberos Salamanca 127', 'bomberos.salamanca127', 'Es mi unidad de bomberos').kind).toBe('org')
    expect(classifyEntity('Grupo Herber', 'grupoherber', 'Centro de entrenamiento para bomberos en peru').kind).toBe('org')
  })

  it('la nota de Aaron manda sobre el nombre', () => {
    // El nombre no dice nada, pero él describió la cuenta.
    expect(classifyEntity('El Profeta', 'diarioelprofeta', 'Es una pagina sobre harry potter').kind).toBe('org')
    expect(classifyEntity('Impala Airguns', 'impalaairguns', 'Pagina de venta de armas en peru').kind).toBe('org')
  })

  it('mi propia pista generada NO cuenta como nota suya', () => {
    // "el handle dice ..." lo escribo yo; no debe pesar como si él lo hubiera dicho.
    expect(classifyEntity('Alberto Salas', 'alberto.gsalas', 'el handle dice "peru"').kind).toBe('person')
  })

  it('vacío es inválido', () => {
    expect(classifyEntity('', 'x').kind).toBe('invalid')
    expect(classifyEntity('  ', 'x').kind).toBe('invalid')
  })
})

describe('looksTruncated', () => {
  it('requiere margen: no marca nombres cortos reales', () => {
    expect(looksTruncated('Amy', 'amyst02')).toBe(false)
    expect(looksTruncated('Impal', 'impalaairguns')).toBe(true)
  })
  it('no marca nombres largos', () => {
    expect(looksTruncated('Antonella', 'antonellaarrarte')).toBe(false)
  })
})

describe('orgSlug', () => {
  it('slug estable y sin tildes', () => {
    expect(orgSlug('Bomberos Salamanca 127')).toBe('bomberos-salamanca-127')
    expect(orgSlug('Fuerza Aérea del Perú')).toBe('fuerza-aerea-del-peru')
  })
})

describe('inferParentOrg', () => {
  it('una compañía de bomberos cuelga del CGBVP — la jerarquía que describió Aaron', () => {
    expect(inferParentOrg('Bomberos Salamanca 127', ['cgbvp', 'rit'])).toBe('cgbvp')
    expect(inferParentOrg('Bomberos Ate 169', ['cgbvp'])).toBe('cgbvp')
  })
  it('no inventa padres para lo que no sabe', () => {
    expect(inferParentOrg('Bazar Nelly', ['cgbvp'])).toBeNull()
    expect(inferParentOrg('Bomberos Salamanca 127', [])).toBeNull()
  })
})
