import { describe, it, expect } from 'vitest'
import { planPersonCapture, PERSON_LINKABLE_CAPTURE_TYPES } from './person-capture'

describe('planPersonCapture', () => {
  it('dm_conversation se asocia a la persona (link), no se rechaza', () => {
    expect(PERSON_LINKABLE_CAPTURE_TYPES).toContain('dm_conversation')
    expect(planPersonCapture('dm_conversation').kind).toBe('link')
  })
  it('whatsapp_chat e instagram siguen siendo link', () => {
    expect(planPersonCapture('whatsapp_chat').kind).toBe('link')
    expect(planPersonCapture('instagram').kind).toBe('link')
  })
  it('scale es self (no se asocia)', () => {
    expect(planPersonCapture('scale').kind).toBe('scale')
  })
  it('hrv_panel/unknown no se asocian a persona', () => {
    expect(planPersonCapture('hrv_panel').kind).toBe('unsupported')
    expect(planPersonCapture('unknown').kind).toBe('unsupported')
  })
})
