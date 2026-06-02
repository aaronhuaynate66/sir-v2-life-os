// SIR V2 — Tests del cómputo determinístico de ejes (sin LLM).
//
// compute.ts reusa las narrativas puras; estos tests confirman que la `data`
// cruda de una observation produce el texto del eje correcto (o null sin
// material), incluida la reconciliación de educación para el eje profesional.

import { describe, it, expect } from 'vitest'

import { computeProfessionalAxis, computeSocialAxis } from './compute'

describe('computeProfessionalAxis', () => {
  it('arma el eje desde LinkedIn + educación de registro', () => {
    const text = computeProfessionalAxis(
      {
        currentRole: 'Ingeniera de Datos',
        currentCompany: 'Globant',
        connectionsCount: 540,
        workHistory: [
          { name: 'Globant', title: 'Ing. de Datos', dateRange: '2022 - hoy' },
          { name: 'BBVA', title: 'Analista', dateRange: '2019 - 2022' },
        ],
      },
      'Universitario · Ing. Informática',
    )
    expect(text).toContain('Se desempeña como Ingeniera de Datos en Globant.')
    expect(text).toContain('Antes pasó por BBVA.')
    expect(text).toContain('540 conexiones en LinkedIn.')
    // La educación de registro entra al eje (sin LinkedIn education que la pise).
    expect(text).toContain('Estudió Universitario · Ing. Informática.')
  })

  it('sin material → null', () => {
    expect(computeProfessionalAxis({}, null)).toBeNull()
  })
})

describe('computeSocialAxis', () => {
  it('arma el eje desde Instagram', () => {
    const text = computeSocialAxis({
      handle: 'diana.d',
      displayName: 'Diana',
      followersCount: 1374,
      followingCount: 320,
      mutualFollowersText: 'its_almendrita, adrian.prog y 12 más siguen esta cuenta',
    })
    expect(text).toContain('aparece como Diana (@diana.d).')
    expect(text).toMatch(/seguidores/)
    expect(text).toContain('seguidores en común')
  })

  it('sin handle → null', () => {
    expect(computeSocialAxis({ followersCount: 100 })).toBeNull()
  })
})
