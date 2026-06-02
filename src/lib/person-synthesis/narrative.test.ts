import { describe, it, expect } from 'vitest'

import { professionalNarrative, socialNarrative } from './narrative'
import type { LinkedInProfileExtracted } from '@/lib/capture/linkedin/types'
import type { InstagramProfileExtracted } from '@/lib/capture/instagram/types'
import type { ReconciledEducation } from '@/lib/observations/education'

const NO_EDU: ReconciledEducation = { primary: null, secondary: null }

function li(over: Partial<LinkedInProfileExtracted> = {}): Partial<LinkedInProfileExtracted> {
  return { ...over }
}

function ig(over: Partial<InstagramProfileExtracted> = {}): Partial<InstagramProfileExtracted> {
  return { ...over }
}

describe('professionalNarrative', () => {
  it('sin datos → null', () => {
    expect(professionalNarrative({ li: null, education: NO_EDU })).toBeNull()
    expect(professionalNarrative({ li: li(), education: NO_EDU })).toBeNull()
  })

  it('arma párrafo con educación + rol + conexiones', () => {
    const edu: ReconciledEducation = {
      primary: { value: 'Administración · Universidad X', hint: '2018-2020', source: 'linkedin' },
      secondary: null,
    }
    const p = professionalNarrative({
      li: li({ currentRole: 'Analista de RRHH', currentCompany: 'ACME', connectionsCount: 56 }),
      education: edu,
    })
    expect(p).toContain('Estudió Administración · Universidad X (2018-2020).')
    expect(p).toContain('Se desempeña como Analista de RRHH en ACME.')
    expect(p).toContain('56 conexiones en LinkedIn.')
  })

  it('usa el headline como presentación cuando no hay rol+empresa', () => {
    const p = professionalNarrative({
      li: li({ headline: 'Founder | Building things' }),
      education: NO_EDU,
    })
    expect(p).toContain('Se presenta como "Founder | Building things".')
  })

  it('recorta el about a la primera oración', () => {
    const p = professionalNarrative({
      li: li({ about: 'Trabajadora en equipo. Me gusta aprender cosas nuevas todos los días.' }),
      education: NO_EDU,
    })
    expect(p).toContain('En su perfil se describe: "Trabajadora en equipo.".')
  })

  it('menciona open to work', () => {
    const p = professionalNarrative({ li: li({ isOpenToWork: true, currentRole: 'Dev' }), education: NO_EDU })
    expect(p).toContain('abierta/o a nuevas oportunidades')
  })

  it('lista empresas previas del historial laboral (trayectoria, gema V1)', () => {
    const p = professionalNarrative({
      li: li({
        currentRole: 'Ing. de Datos',
        currentCompany: 'Globant',
        workHistory: [
          { name: 'Globant', title: 'Ing. de Datos', dateRange: '2022 - hoy' },
          { name: 'BBVA', title: 'Analista', dateRange: '2019 - 2022' },
          { name: 'Belcorp', title: 'Practicante', dateRange: '2018 - 2019' },
        ],
      }),
      education: NO_EDU,
    })
    expect(p).toContain('Antes pasó por BBVA y Belcorp.')
  })

  it('sin trayectoria previa (historial de 1) → no agrega la oración', () => {
    const p = professionalNarrative({
      li: li({
        currentRole: 'Dev',
        currentCompany: 'Acme',
        workHistory: [{ name: 'Acme', title: 'Dev', dateRange: '2020 - hoy' }],
      }),
      education: NO_EDU,
    })
    expect(p).not.toContain('Antes pasó por')
  })
})

describe('socialNarrative', () => {
  it('sin handle → null', () => {
    expect(socialNarrative({ ig: null })).toBeNull()
    expect(socialNarrative({ ig: ig({ followersCount: 100 }) })).toBeNull()
  })

  it('arma párrafo con identidad + alcance', () => {
    const p = socialNarrative({
      ig: ig({ handle: 'diana.d', displayName: 'Diana', followersCount: 1374, followingCount: 320, postsCount: 88 }),
    })
    expect(p).toContain('aparece como Diana (@diana.d).')
    expect(p).toMatch(/seguidores/)
    expect(p).toContain('sigue a 320')
    expect(p).toContain('88 publicaciones')
  })

  it('marca verificada y privada + categoría', () => {
    const p = socialNarrative({
      ig: ig({ handle: 'brand', category: 'Marca de ropa', isVerified: true, isPrivate: true }),
    })
    expect(p).toContain(', Marca de ropa,')
    expect(p).toContain('Es una cuenta verificada.')
    expect(p).toContain('Su cuenta es privada.')
  })

  it('incluye la bio recortada', () => {
    const p = socialNarrative({ ig: ig({ handle: 'x', bio: 'Amante del café. Y de viajar por el mundo.' }) })
    expect(p).toContain('Su bio dice: "Amante del café.".')
  })
})
