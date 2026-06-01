import { describe, it, expect } from 'vitest'

import { planPersonCapture, PERSON_LINKABLE_CAPTURE_TYPES } from './person-capture'
import type { CaptureType } from './observations/types'

describe('planPersonCapture', () => {
  it('tipos con extractor → link (se asocian a la persona)', () => {
    for (const t of ['whatsapp_chat', 'whatsapp_web', 'whatsapp_info', 'instagram', 'linkedin'] as CaptureType[]) {
      expect(planPersonCapture(t)).toEqual({ kind: 'link' })
    }
  })

  it('báscula → scale (self/health, NO la persona)', () => {
    expect(planPersonCapture('scale')).toEqual({ kind: 'scale' })
  })

  it('unknown / sin extractor → unsupported', () => {
    expect(planPersonCapture('unknown')).toEqual({ kind: 'unsupported' })
    expect(planPersonCapture('manual_note')).toEqual({ kind: 'unsupported' })
    expect(planPersonCapture('voice_note')).toEqual({ kind: 'unsupported' })
  })

  it('PERSON_LINKABLE_CAPTURE_TYPES no incluye scale ni unknown', () => {
    expect(PERSON_LINKABLE_CAPTURE_TYPES).not.toContain('scale')
    expect(PERSON_LINKABLE_CAPTURE_TYPES).not.toContain('unknown')
    expect(PERSON_LINKABLE_CAPTURE_TYPES).toContain('whatsapp_chat')
  })
})
