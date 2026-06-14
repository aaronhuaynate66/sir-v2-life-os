import { describe, it, expect } from 'vitest'
import { listOrganizations, type HubPerson } from './companyHub'

const P = (id: string, organization: string | null, orgGroup: string | null = null): HubPerson =>
  ({ id, name: id, slug: id, organization, orgGroup })

describe('listOrganizations', () => {
  it('agrupa por organización y cuenta personas únicas', () => {
    const out = listOrganizations([
      P('a', 'K2 Seguridad', 'Grupo HNG'),
      P('b', 'K2 Seguridad', 'Grupo HNG'),
      P('c', 'Concrefab', 'Grupo HNG'),
    ])
    // a,b,c comparten grupo HNG (mismo orgJoinKey) → 1 org con 3 personas.
    const hng = out.find((o) => /hng/i.test(o.label))
    expect(hng?.count).toBe(3)
  })

  it('ignora personas sin organización', () => {
    const out = listOrganizations([P('a', null), P('b', '')])
    expect(out).toEqual([])
  })

  it('cada item trae slug navegable', () => {
    const out = listOrganizations([P('a', 'Alicorp')])
    expect(out[0].slug).toBe('alicorp')
    expect(out[0].count).toBe(1)
  })
})
