import { describe, it, expect } from 'vitest'
import { buildSectionButtons, parseBriefCallback, briefCallbackData } from './briefThread'
import type { MorningSignal } from '@/lib/push/morning'

const señal = (o: Partial<MorningSignal> = {}): MorningSignal => ({
  slot: 'opportunity', section: 'metas',
  text: '💼 Miluska te pidió una cotización y no está como oportunidad',
  entity: { kind: 'opportunity', id: 'opp_abc123', name: 'Miluska Castillo' },
  ...o,
})

describe('botones de oportunidad en el brief', () => {
  it('ofrece las DOS salidas: registrar y descartar', () => {
    const rows = buildSectionButtons([señal()])
    const textos = rows.flat().map((b) => b.text)
    expect(textos).toContain('💼 Registrar oportunidad')
    expect(textos).toContain('✕ No es negocio')
  })

  it('los callbacks apuntan al id de la señal y viajan de ida y vuelta', () => {
    const rows = buildSectionButtons([señal()])
    const btns = rows.flat()
    const reg = btns.find((b) => b.text.includes('Registrar'))!
    const no = btns.find((b) => b.text.includes('No es negocio'))!
    expect(parseBriefCallback(reg.callbackData)).toEqual({ kind: 'opp_reg', ref: 'opp_abc123' })
    expect(parseBriefCallback(no.callbackData)).toEqual({ kind: 'opp_no', ref: 'opp_abc123' })
  })

  it('sin entidad no hay botones (nada que no haga nada)', () => {
    const rows = buildSectionButtons([señal({ entity: undefined })])
    expect(rows.flat().map((b) => b.text)).not.toContain('💼 Registrar oportunidad')
  })

  it('los nuevos kinds caben en los 64 bytes del callback de Telegram', () => {
    expect(briefCallbackData('opp_reg', 'opp_' + 'a'.repeat(32))).not.toBe('')
    expect(briefCallbackData('opp_no', 'opp_' + 'a'.repeat(32))).not.toBe('')
  })

  it('un callback con kind desconocido sigue devolviendo null', () => {
    expect(parseBriefCallback('br|opp_otro|x')).toBeNull()
  })
})
