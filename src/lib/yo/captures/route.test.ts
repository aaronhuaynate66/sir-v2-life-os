// SIR V2 — Tests del ruteo de capturas propias (panel "Mis capturas").

import { describe, it, expect } from 'vitest'
import { routeSelfCapture } from './route'
import type { CaptureType } from '@/lib/capture/observations/types'

describe('routeSelfCapture', () => {
  it('rutea báscula a scale', () => {
    expect(routeSelfCapture('scale').route).toBe('scale')
  })

  it('rutea panel de sueño a sleep', () => {
    expect(routeSelfCapture('sleep_panel').route).toBe('sleep')
  })

  it('rutea panel de FC a hr', () => {
    expect(routeSelfCapture('heart_rate_panel').route).toBe('hr')
  })

  it('rutea perfiles propios (linkedin/instagram) a identity', () => {
    expect(routeSelfCapture('linkedin').route).toBe('identity')
    expect(routeSelfCapture('instagram').route).toBe('identity')
  })

  it('rechaza capturas de otras personas (whatsapp_*) con motivo', () => {
    for (const t of ['whatsapp_chat', 'whatsapp_web', 'whatsapp_info'] as CaptureType[]) {
      const d = routeSelfCapture(t)
      expect(d.route).toBe('reject')
      expect(d.reason).toMatch(/otra persona|Captura/i)
    }
  })

  it('rechaza tipos no-self (manual/voice/unknown) con motivo', () => {
    for (const t of ['manual_note', 'voice_note', 'unknown'] as CaptureType[]) {
      const d = routeSelfCapture(t)
      expect(d.route).toBe('reject')
      expect(d.reason).toBeTruthy()
    }
  })

  it('es determinístico', () => {
    expect(routeSelfCapture('scale')).toEqual(routeSelfCapture('scale'))
    expect(routeSelfCapture('linkedin')).toEqual(routeSelfCapture('instagram'))
  })
})
