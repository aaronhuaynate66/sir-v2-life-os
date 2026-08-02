// SIR V2 — Tests de los entregables.
//
// Aaron, 2-ago-2026: *"así solo acá no me sirve"*. La tabla existe para que un
// documento no muera en `docs/`; estos tests protegen lo que la hace útil de
// verdad — que un entregable LISTO y sin enviar se reclame solo.
import { describe, it, expect } from 'vitest'
import {
  filaADocumento, diasSinEnviar, entregablePendiente, entregablePendienteLine,
  resumenDeCuerpo, DIAS_PARA_RECLAMAR, ETIQUETA_TIPO,
  type Documento,
} from './tipos'

const HOY = '2026-08-05'
const doc = (d: Partial<Documento>): Documento => ({
  id: 'd1', title: 'Informe a FEDEPOL', kind: 'informe', status: 'listo',
  body: 'Estimado Shian...', createdAt: '2026-08-02T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z', ...d,
})

describe('lo que hace que sea un ENTREGABLE y no una nota', () => {
  it('un documento listo y sin enviar se reclama', () => {
    const p = entregablePendiente([doc({})], HOY)!
    expect(p.dias).toBe(3)
    expect(entregablePendienteLine(p)).toContain('listo hace 3 días')
    expect(entregablePendienteLine(p)).toContain('¿Lo envías hoy?')
  })

  it('un BORRADOR no se reclama: todavía se está escribiendo', () => {
    expect(entregablePendiente([doc({ status: 'borrador' })], HOY)).toBeNull()
  })

  it('uno ya ENVIADO tampoco', () => {
    expect(entregablePendiente([doc({ status: 'enviado' })], HOY)).toBeNull()
  })

  it('recién puesto listo no molesta', () => {
    expect(DIAS_PARA_RECLAMAR).toBe(2)
    expect(entregablePendiente([doc({ updatedAt: '2026-08-04T00:00:00Z' })], HOY)).toBeNull()
  })

  it('con varios, reclama el que lleva MÁS esperando', () => {
    const p = entregablePendiente([
      doc({ id: 'nuevo', updatedAt: '2026-08-03T00:00:00Z' }),
      doc({ id: 'viejo', title: 'Cotización Hikvision', updatedAt: '2026-07-20T00:00:00Z' }),
    ], HOY)!
    expect(p.doc.id).toBe('viejo')
    expect(p.dias).toBe(16)
  })
})

describe('filaADocumento', () => {
  it('mapea snake_case y respeta los valores válidos', () => {
    const d = filaADocumento({
      id: 'x', title: 'Cotización', kind: 'cotizacion', status: 'enviado',
      body: 'texto', internal_note: 'ojo', person_id: 'per_1', objective_id: null,
      created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-02T00:00:00Z',
    })
    expect(d.kind).toBe('cotizacion')
    expect(d.internalNote).toBe('ojo')
    expect(d.personId).toBe('per_1')
    expect(d.objectiveId).toBeNull()
  })

  it('un tipo o estado inventado cae a un valor seguro, no se propaga', () => {
    const d = filaADocumento({ id: 'x', kind: 'factura_electronica', status: 'archivado' })
    expect(d.kind).toBe('otro')
    expect(d.status).toBe('borrador')
  })

  it('no revienta con una fila incompleta', () => {
    const d = filaADocumento({})
    expect(d.title).toBe('(sin título)')
    expect(d.body).toBe('')
    // `updated_at` ausente cae a `created_at`: si no, un documento viejo parecería
    // recién tocado y nunca se reclamaría.
    expect(filaADocumento({ created_at: '2026-01-01T00:00:00Z' }).updatedAt).toBe('2026-01-01T00:00:00Z')
  })
})

describe('no revienta', () => {
  it('con basura', () => {
    expect(entregablePendiente([], HOY)).toBeNull()
    expect(entregablePendiente(null as unknown as Documento[], HOY)).toBeNull()
    expect(entregablePendiente([doc({ updatedAt: 'no-es-fecha' })], HOY)).toBeNull()
    expect(entregablePendienteLine(null)).toBeNull()
    expect(diasSinEnviar(doc({}), 'no-es-fecha')).toBeNull()
  })

  it('resumenDeCuerpo aplana y recorta', () => {
    expect(resumenDeCuerpo('hola\n\n  mundo  ')).toBe('hola mundo')
    expect(resumenDeCuerpo('x'.repeat(300)).length).toBeLessThanOrEqual(160)
    expect(resumenDeCuerpo('')).toBe('')
  })

  it('todos los tipos tienen etiqueta en castellano', () => {
    for (const [, v] of Object.entries(ETIQUETA_TIPO)) expect(v.length).toBeGreaterThan(3)
  })
})

// —— El botón del brief (2-ago-2026) ————————————————————————————————————
// Sin forma de apagar el reclamo, el aviso vuelve cada mañana para siempre y se
// convierte en el ruido que él ya ignora.
describe('el entregable en el brief', () => {
  it('lleva botón para apagarlo', async () => {
    const { buildSectionButtons } = await import('@/lib/telegram/briefThread')
    const rows = buildSectionButtons([{
      slot: 'entregablePendiente', section: 'metas',
      text: '📄 "Informe a FEDEPOL" está listo hace 3 días…',
      entity: { kind: 'documento', id: 'doc_1', name: 'Informe a FEDEPOL' },
    }])
    const b = rows.flat()[0]
    expect(b.text).toBe('✅ Ya lo mandé')
    expect(b.callbackData).toBe('br|doc_sent|doc_1')
  })

  it('el callback sobrevive ida y vuelta', async () => {
    const { parseBriefCallback } = await import('@/lib/telegram/briefThread')
    expect(parseBriefCallback('br|doc_sent|doc_1')).toEqual({ kind: 'doc_sent', ref: 'doc_1' })
  })
})
