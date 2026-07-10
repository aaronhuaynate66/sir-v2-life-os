// SIR V2 — Tests de la capa PURA de ingestión documental (sin red, sin LLM).

import { describe, it, expect } from 'vitest'

import { parseDocumentResponse, buildDocumentInput } from './prompt'
import {
  documentTextHash,
  documentMemoryId,
  sanitizeProposals,
  proposalToMemoryRow,
  buildDocumentMemoryRows,
} from './memoryRow'
import type { DocMemoryProposal } from './types'

describe('parseDocumentResponse', () => {
  it('parsea un JSON válido con memorias', () => {
    const raw = JSON.stringify({
      title: 'Informe trimestral',
      docKind: 'informe',
      legible: true,
      summary: 'Resume el Q2.',
      memories: [
        { type: 'semantic', title: 'Ingresos', content: 'Los ingresos subieron 12% en Q2.', importance: 8, tags: ['finanzas'] },
        { type: 'temporal', title: 'Cierre', content: 'El cierre fiscal es el 30 de junio.', importance: 6, tags: [] },
      ],
    })
    const r = parseDocumentResponse(raw)
    expect(r).not.toBeNull()
    expect(r!.title).toBe('Informe trimestral')
    expect(r!.docKind).toBe('informe')
    expect(r!.legible).toBe(true)
    expect(r!.memories).toHaveLength(2)
    expect(r!.memories[0].importance).toBe(8)
  })

  it('tolera prosa y fences alrededor del JSON', () => {
    const raw = 'Claro, acá va:\n```json\n' + JSON.stringify({
      title: 'X', docKind: 'nota', legible: true, summary: 's',
      memories: [{ type: 'semantic', title: 't', content: 'contenido válido', importance: 5, tags: [] }],
    }) + '\n```\nEspero que sirva.'
    const r = parseDocumentResponse(raw)
    expect(r).not.toBeNull()
    expect(r!.memories).toHaveLength(1)
  })

  it('clampa importance fuera de rango y normaliza el tipo inválido', () => {
    const raw = JSON.stringify({
      title: 't', docKind: 'zzz', legible: true, summary: '',
      memories: [{ type: 'inventado', title: 't', content: 'algo', importance: 99, tags: ['a', 2, 'b'] }],
    })
    const r = parseDocumentResponse(raw)!
    expect(r.docKind).toBe('otro')
    expect(r.memories[0].type).toBe('semantic')
    expect(r.memories[0].importance).toBe(10)
    expect(r.memories[0].tags).toEqual(['a', 'b'])
  })

  it('descarta memorias sin contenido', () => {
    const raw = JSON.stringify({
      title: 't', docKind: 'nota', legible: true, summary: '',
      memories: [{ type: 'semantic', title: 'vacía', content: '  ', importance: 5 }],
    })
    const r = parseDocumentResponse(raw)!
    expect(r.memories).toHaveLength(0)
    // sin memorias → legible se fuerza a false
    expect(r.legible).toBe(false)
  })

  it('devuelve null si no hay JSON', () => {
    expect(parseDocumentResponse('no hay json acá')).toBeNull()
    expect(parseDocumentResponse('')).toBeNull()
  })

  it('respeta legible=false del modelo', () => {
    const raw = JSON.stringify({ title: 'scan', docKind: 'otro', legible: false, summary: 'parece un scan', memories: [] })
    const r = parseDocumentResponse(raw)!
    expect(r.legible).toBe(false)
    expect(r.memories).toHaveLength(0)
  })
})

describe('buildDocumentInput', () => {
  it('incluye el nombre de archivo y el texto', () => {
    const s = buildDocumentInput('informe.pdf', 'contenido del documento', { pagesRead: 3, totalPages: 5 })
    expect(s).toContain('informe.pdf')
    expect(s).toContain('contenido del documento')
    expect(s).toContain('3 leídas de 5')
  })

  it('recorta y avisa cuando el texto es enorme', () => {
    const big = 'a'.repeat(60_000)
    const s = buildDocumentInput('x', big)
    expect(s).toContain('recortado')
    expect(s.length).toBeLessThan(60_000)
  })
})

describe('documentTextHash / documentMemoryId', () => {
  it('es determinístico para el mismo texto', () => {
    const a = documentTextHash('mismo texto')
    const b = documentTextHash('mismo texto')
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{16}$/)
  })

  it('cambia con texto distinto', () => {
    expect(documentTextHash('uno')).not.toBe(documentTextHash('dos'))
  })

  it('deriva ids con prefijo doc_ y no colisiona con mem_', () => {
    const id = documentMemoryId('abc123', 2)
    expect(id).toBe('doc_abc123_2')
    expect(id.startsWith('mem_')).toBe(false)
  })
})

describe('sanitizeProposals', () => {
  it('filtra propuestas sin contenido y normaliza', () => {
    const out = sanitizeProposals([
      { type: 'semantic', title: 'ok', content: 'contenido', importance: 3, tags: ['x'] },
      { type: 'raro', title: '', content: 'sin título válido', importance: 50, tags: 'no-array' },
      { type: 'semantic', content: '   ' }, // vacía → fuera
      'no-objeto',
      null,
    ])
    expect(out).toHaveLength(2)
    expect(out[0].content).toBe('contenido')
    expect(out[1].type).toBe('semantic') // 'raro' normalizado
    expect(out[1].importance).toBe(10) // clamp
    expect(out[1].title).not.toBe('') // cae al inicio del contenido
    expect(out[1].tags).toEqual([]) // no-array → []
  })

  it('devuelve [] para entrada no-array', () => {
    expect(sanitizeProposals('nope')).toEqual([])
    expect(sanitizeProposals(undefined)).toEqual([])
  })
})

describe('proposalToMemoryRow / buildDocumentMemoryRows', () => {
  const p: DocMemoryProposal = { type: 'semantic', title: 'T', content: 'C', importance: 7, tags: ['a'] }

  it('mapea a un row de memories con source document y sin observation', () => {
    const row = proposalToMemoryRow(p, {
      userId: 'u1', docHash: 'hh', index: 0, personId: null, occurredAt: '2026-07-10T00:00:00Z', docTitle: 'Doc',
    })
    expect(row.id).toBe('doc_hh_0')
    expect(row.source).toBe('document')
    expect(row.observation_id).toBeNull()
    expect(row.person_id).toBeNull()
    expect(row.entities).toEqual([])
    expect(row.type).toBe('semantic')
    expect(row.tags).toContain('doc:Doc')
    expect(row.occurred_at).toBe('2026-07-10T00:00:00Z')
  })

  it('liga entities/person_id cuando hay persona', () => {
    const row = proposalToMemoryRow(p, {
      userId: 'u1', docHash: 'hh', index: 1, personId: 'per_x', occurredAt: '2026-07-10T00:00:00Z', docTitle: 'Doc',
    })
    expect(row.person_id).toBe('per_x')
    expect(row.entities).toEqual(['per_x'])
  })

  it('genera ids idempotentes por índice', () => {
    const rows = buildDocumentMemoryRows([p, p, p], {
      userId: 'u1', docHash: 'zz', personId: null, occurredAt: '2026-07-10T00:00:00Z', docTitle: 'D',
    })
    expect(rows.map((r) => r.id)).toEqual(['doc_zz_0', 'doc_zz_1', 'doc_zz_2'])
  })
})
