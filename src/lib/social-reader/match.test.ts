import { describe, it, expect } from 'vitest'
import { canonHandle, linkedinSlug, normName, buildPersonIndex, matchPerson, type PersonLite } from './match'

const P = (over: Partial<PersonLite> & { id: string; name: string }): PersonLite => ({
  instagramHandle: null, linkedinUrl: null, title: null, ...over,
})

describe('helpers', () => {
  it('canonHandle quita @ y baja a minúsculas', () => {
    expect(canonHandle('@Dayrrit')).toBe('dayrrit')
  })
  it('linkedinSlug saca el slug de varias formas', () => {
    expect(linkedinSlug('https://www.linkedin.com/in/dayana-y/')).toBe('dayana-y')
    expect(linkedinSlug('linkedin.com/in/Juan.Perez?x=1')).toBe('juan.perez')
    expect(linkedinSlug('dayana-y')).toBe('dayana-y')
  })
  it('normName saca tildes y colapsa espacios', () => {
    expect(normName('  Dayana   Yrribarren  ')).toBe('dayana yrribarren')
    expect(normName('José Ñández')).toBe('jose nandez')
  })
})

describe('buildPersonIndex + matchPerson', () => {
  const people: PersonLite[] = [
    P({ id: 'day', name: 'Dayana Yrribarren', instagramHandle: 'dayrrit' }),
    P({ id: 'alex', name: 'Alex Heilbrunn', linkedinUrl: 'https://linkedin.com/in/alex-h' }),
    P({ id: 'j1', name: 'Juan Perez' }),
    P({ id: 'j2', name: 'Juan Perez' }), // nombre duplicado → ambiguo
  ]
  const idx = buildPersonIndex(people)

  it('matchea IG por handle', () => {
    expect(matchPerson(idx, { platform: 'instagram', handle: '@dayrrit' })?.person.id).toBe('day')
  })
  it('matchea IG por NOMBRE cuando el handle no está seteado (bootstrap del handle)', () => {
    // Alex no tiene instagram_handle; el tray trae su full_name → match por nombre.
    const m = matchPerson(idx, { platform: 'instagram', handle: 'alexh_ig', name: 'Alex Heilbrunn' })
    expect(m?.person.id).toBe('alex'); expect(m?.matchedBy).toBe('name')
  })
  it('IG prioriza el handle exacto sobre el nombre', () => {
    const m = matchPerson(idx, { platform: 'instagram', handle: '@dayrrit', name: 'Otro Nombre' })
    expect(m?.person.id).toBe('day'); expect(m?.matchedBy).toBe('ig_handle')
  })
  it('matchea LinkedIn por slug', () => {
    const m = matchPerson(idx, { platform: 'linkedin', linkedinUrl: 'https://www.linkedin.com/in/alex-h/' })
    expect(m?.person.id).toBe('alex'); expect(m?.matchedBy).toBe('li_slug')
  })
  it('matchea LinkedIn por NOMBRE cuando no hay URL (bootstrap)', () => {
    const m = matchPerson(idx, { platform: 'linkedin', linkedinUrl: 'https://linkedin.com/in/dayana-nueva', name: 'Dayana Yrribarren' })
    expect(m?.person.id).toBe('day'); expect(m?.matchedBy).toBe('name')
  })
  it('NO matchea por nombre ambiguo (dos Juan Perez)', () => {
    expect(matchPerson(idx, { platform: 'linkedin', linkedinUrl: 'x/in/jp', name: 'Juan Perez' })).toBeNull()
  })
  it('sin match → null', () => {
    expect(matchPerson(idx, { platform: 'instagram', handle: 'desconocida' })).toBeNull()
  })
})
