// SIR V2 — Tests del resumen de confirmación de WhatsApp.

import { describe, it, expect } from 'vitest'
import { buildConfirmationReply } from './reply'
import type { RelatoIngestResult } from '@/lib/relato-ingest/run'
import type { IngestAction } from '@/lib/relato-ingest/tools'

const act = (kind: string, extra: Record<string, unknown> = {}) => ({ kind, ...extra }) as unknown as IngestAction
const base: RelatoIngestResult = { plan: [], ambiguous: [], modelText: [], invalid: [] }

describe('buildConfirmationReply', () => {
  it('cuenta lo ejecutado OK por tipo + nombra personas', () => {
    const r: RelatoIngestResult = {
      ...base,
      executed: [
        { action: act('crear_moment', { person_full_name: 'Diana Díaz' }), ok: true },
        { action: act('crear_moment', { person_full_name: 'Diana Díaz' }), ok: true },
        { action: act('crear_person_log', { person_full_name: 'Diana Díaz' }), ok: true },
      ],
    }
    const msg = buildConfirmationReply(r)
    expect(msg).toContain('2 momentos')
    expect(msg).toContain('1 registro')
    expect(msg).toContain('Diana Díaz')
    expect(msg).toContain('✅')
  })

  it('singular correcto', () => {
    const r: RelatoIngestResult = { ...base, executed: [{ action: act('crear_nota_manual'), ok: true }] }
    expect(buildConfirmationReply(r)).toContain('1 nota')
  })

  it('lista lo ambiguo pidiendo nombre completo', () => {
    const r: RelatoIngestResult = { ...base, ambiguous: [act('flag_ambiguo', { person_full_name: 'Andrea' })] }
    const msg = buildConfirmationReply(r)
    expect(msg).toContain('⚠️')
    expect(msg).toContain('Andrea')
  })

  it('avisa fallos', () => {
    const r: RelatoIngestResult = {
      ...base,
      executed: [
        { action: act('crear_moment', { person_full_name: 'X Y' }), ok: true },
        { action: act('crear_person_log'), ok: false, error: 'boom' },
      ],
    }
    const msg = buildConfirmationReply(r)
    expect(msg).toContain('✅')
    expect(msg).toContain('❌')
    expect(msg).toContain('1 cosa no se pudo')
  })

  it('nada concreto → pide más detalle', () => {
    expect(buildConfirmationReply(base)).toContain('detalle')
  })
})
