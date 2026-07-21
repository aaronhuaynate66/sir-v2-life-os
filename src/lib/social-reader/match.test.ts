import { describe, it, expect } from 'vitest'
import { canonHandle, linkedinSlug, normName, buildPersonIndex, matchPerson, identityKey, type PersonLite } from './match'

describe('identityKey', () => {
  it('IG por handle canónico', () => {
    expect(identityKey({ platform: 'instagram', handle: '@Dayrrit' })).toBe('ig:dayrrit')
  })
  it('LinkedIn por slug de la URL', () => {
    expect(identityKey({ platform: 'linkedin', linkedinUrl: 'https://www.linkedin.com/in/Alex-H/' })).toBe('li:alex-h')
  })
  it('cae al nombre normalizado si no hay handle/slug', () => {
    expect(identityKey({ platform: 'instagram', name: 'Diana Díaz 🌸' })).toBe('nm:diana diaz')
  })
  it('null si no hay nada con qué identificar', () => {
    expect(identityKey({ platform: 'instagram' })).toBeNull()
  })
  it('la misma cuenta con o sin @ da la MISMA clave (dedup estable)', () => {
    expect(identityKey({ platform: 'instagram', handle: 'melanievalientee' }))
      .toBe(identityKey({ platform: 'instagram', handle: '@melanievalientee' }))
  })
})

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
  it('normName limpia emojis y puntuación (full_name de IG)', () => {
    expect(normName('Dayana Yrribarren 🌸')).toBe('dayana yrribarren')
    expect(normName('Diana C. Díaz | coach')).toBe('diana c diaz coach')
  })
})

describe('matchPerson — nombre TOLERANTE (full_name de IG casi nunca calza exacto)', () => {
  const people: PersonLite[] = [
    P({ id: 'alex', name: 'Alex Heilbrunn' }),
    P({ id: 'dcds', name: 'Diana Carolina Diaz Sanchez' }),
    P({ id: 'dcdl', name: 'Diana Carolina Diaz Lopez' }), // comparte tokens con dcds
    P({ id: 'walter', name: 'Walter Heilbrunn' }),        // comparte "heilbrunn" con alex
  ]
  const idx = buildPersonIndex(people)

  it('emoji/símbolos en el full_name no rompen el match', () => {
    const m = matchPerson(idx, { platform: 'instagram', handle: 'alexh_ig', name: 'Alex Heilbrunn 🔥' })
    expect(m?.person.id).toBe('alex'); expect(m?.matchedBy).toBe('name')
  })
  it('tokens subconjunto: "Diana Diaz Sanchez" ⊆ "Diana Carolina Diaz Sanchez"', () => {
    const m = matchPerson(idx, { platform: 'instagram', handle: 'x', name: 'Diana Diaz Sanchez' })
    expect(m?.person.id).toBe('dcds')
  })
  it('ambiguo (dos Diana Carolina Diaz) → NO matchea', () => {
    expect(matchPerson(idx, { platform: 'instagram', handle: 'x', name: 'Diana Carolina Diaz' })).toBeNull()
  })
  it('un solo token → NO matchea (evita match por primer nombre)', () => {
    expect(matchPerson(idx, { platform: 'instagram', handle: 'x', name: 'Diana' })).toBeNull()
  })
  it('un solo apellido compartido → NO matchea (Heilbrunn en 2 personas)', () => {
    expect(matchPerson(idx, { platform: 'instagram', handle: 'x', name: 'Heilbrunn' })).toBeNull()
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
