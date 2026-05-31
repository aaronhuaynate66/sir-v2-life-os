// SIR V2 — Tests del núcleo de reconciliación del sync.
//
// Cubre el bug multicapa que arreglamos: pendingIds distingue una fila
// genuinamente pendiente (offline) de una FANTASMA adoptada por un pull
// viejo; DB es autoritativo; los deletes remotos se propagan (la fila
// ausente de DB y no-pendiente se dropea, sin resucitar); las filas reales
// de DB (ej. Diana) jamás se dropean.

import { describe, it, expect } from 'vitest'

import { diffSlice, reconcilePull, parsePendingIds } from './reconcile'

interface Row {
  id: string
  v?: number
}

const row = (id: string, v = 0): Row => ({ id, v })

describe('diffSlice', () => {
  it('detecta inserts (id nuevo en curr)', () => {
    const a = row('a')
    const b = row('b')
    const { upserts, deletes } = diffSlice([a], [a, b])
    expect(upserts).toEqual([b])
    expect(deletes).toEqual([])
  })

  it('detecta updates por desigualdad referencial', () => {
    const a1 = row('a', 1)
    const a2 = row('a', 2) // mismo id, otra referencia
    const { upserts, deletes } = diffSlice([a1], [a2])
    expect(upserts).toEqual([a2])
    expect(deletes).toEqual([])
  })

  it('NO marca upsert si la referencia es idéntica (no-op)', () => {
    const a = row('a', 1)
    const b = row('b', 2)
    const { upserts, deletes } = diffSlice([a, b], [a, b])
    expect(upserts).toEqual([])
    expect(deletes).toEqual([])
  })

  it('detecta deletes (id en prev ausente de curr)', () => {
    const a = row('a')
    const b = row('b')
    const { upserts, deletes } = diffSlice([a, b], [a])
    expect(upserts).toEqual([])
    expect(deletes).toEqual(['b'])
  })

  it('maneja insert + update + delete combinados', () => {
    const a1 = row('a', 1)
    const a2 = row('a', 2)
    const b = row('b')
    const c = row('c')
    const { upserts, deletes } = diffSlice([a1, b], [a2, c])
    expect(new Set(upserts)).toEqual(new Set([a2, c]))
    expect(deletes).toEqual(['b'])
  })

  it('prev vacío -> todo es upsert; curr vacío -> todo es delete', () => {
    const a = row('a')
    expect(diffSlice([], [a])).toEqual({ upserts: [a], deletes: [] })
    expect(diffSlice([a], [])).toEqual({ upserts: [], deletes: ['a'] })
  })
})

describe('reconcilePull', () => {
  it('DB es autoritativo: todas las filas de DB quedan en next', () => {
    const db = [row('diana'), row('maria')]
    const { next } = reconcilePull(db, [], new Set())
    expect(next.map((r) => r.id)).toEqual(['diana', 'maria'])
  })

  it('conserva una fila local ausente de DB SI está pendiente (creada offline)', () => {
    const db = [row('diana')]
    const local = [row('diana'), row('offline-1')]
    const pending = new Set(['offline-1'])
    const { next, droppedIds } = reconcilePull(db, local, pending)
    expect(next.map((r) => r.id)).toEqual(['diana', 'offline-1'])
    expect(droppedIds).toEqual([])
  })

  it('DROPEA una fila local ausente de DB y NO pendiente (delete remoto / fantasma)', () => {
    // Este es el corazón del bug: la fila "ghost" fue adoptada por un pull
    // viejo, no tiene push pendiente, y ya no está en DB -> debe dropearse.
    const db = [row('diana')]
    const local = [row('diana'), row('ghost')]
    const { next, droppedIds } = reconcilePull(db, local, new Set())
    expect(next.map((r) => r.id)).toEqual(['diana'])
    expect(droppedIds).toEqual(['ghost'])
  })

  it('propaga un delete remoto: fila borrada en otro device desaparece del receptor', () => {
    // local tenía la fila (de un pull anterior), pero ya no está en DB y no
    // es pendiente -> se va.
    const db: Row[] = []
    const local = [row('borrada-remota')]
    const { next, droppedIds } = reconcilePull(db, local, new Set())
    expect(next).toEqual([])
    expect(droppedIds).toEqual(['borrada-remota'])
  })

  it('una fila REAL de DB nunca se dropea aunque también esté local (Diana)', () => {
    const db = [row('diana', 9)]
    const local = [row('diana', 1)] // versión local vieja
    const { next, droppedIds } = reconcilePull(db, local, new Set())
    // gana la de DB (autoritativa) y no se dropea nada.
    expect(next).toHaveLength(1)
    expect(next[0]).toBe(db[0])
    expect(droppedIds).toEqual([])
  })

  it('confirmedPendingIds = intersección de pending con ids de DB', () => {
    // 'a' estaba pendiente y ahora aparece en DB (confirmada);
    // 'b' sigue pendiente y NO está en DB (se conserva);
    // 'c' es pendiente huérfano que tampoco está local (no afecta next).
    const db = [row('a'), row('diana')]
    const local = [row('a'), row('b')]
    const pending = new Set(['a', 'b', 'c'])
    const { next, confirmedPendingIds } = reconcilePull(db, local, pending)
    expect(confirmedPendingIds).toEqual(['a'])
    // 'b' pendiente ausente de DB se preserva; 'a' viene de DB.
    expect(next.map((r) => r.id).sort()).toEqual(['a', 'b', 'diana'])
  })

  it('orden de next: filas de DB primero, luego pendientes preservadas', () => {
    const db = [row('db1'), row('db2')]
    const local = [row('p1'), row('p2')]
    const pending = new Set(['p1', 'p2'])
    const { next } = reconcilePull(db, local, pending)
    expect(next.map((r) => r.id)).toEqual(['db1', 'db2', 'p1', 'p2'])
  })

  it('no muta los arrays de entrada', () => {
    const db = [row('a')]
    const local = [row('a'), row('ghost')]
    const dbCopy = [...db]
    const localCopy = [...local]
    reconcilePull(db, local, new Set())
    expect(db).toEqual(dbCopy)
    expect(local).toEqual(localCopy)
  })
})

describe('parsePendingIds', () => {
  it('null/"" -> Set vacío', () => {
    expect(parsePendingIds(null)).toEqual(new Set())
    expect(parsePendingIds('')).toEqual(new Set())
  })

  it('array de strings -> Set', () => {
    expect(parsePendingIds('["a","b"]')).toEqual(new Set(['a', 'b']))
  })

  it('filtra elementos no-string', () => {
    expect(parsePendingIds('["a",1,null,true,"b"]')).toEqual(new Set(['a', 'b']))
  })

  it('JSON que no es array -> Set vacío', () => {
    expect(parsePendingIds('{"a":1}')).toEqual(new Set())
    expect(parsePendingIds('42')).toEqual(new Set())
    expect(parsePendingIds('"x"')).toEqual(new Set())
  })

  it('JSON inválido -> Set vacío (no tira)', () => {
    expect(parsePendingIds('{not json')).toEqual(new Set())
    expect(parsePendingIds('[unclosed')).toEqual(new Set())
  })
})
