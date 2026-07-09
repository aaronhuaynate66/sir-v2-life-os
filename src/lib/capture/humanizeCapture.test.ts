import { describe, it, expect } from 'vitest'

import { captureLabel, confidenceLabel } from './humanizeCapture'

describe('captureLabel', () => {
  it('mapea los tipos crudos a etiquetas humanas', () => {
    expect(captureLabel('whatsapp_chat')).toBe('WhatsApp')
    expect(captureLabel('dm_conversation')).toBe('DM / Chat')
    expect(captureLabel('manual_note')).toBe('Nota')
    expect(captureLabel('instagram')).toBe('Instagram')
  })
  it('cae a "Captura" para desconocidos', () => {
    expect(captureLabel('algo_raro')).toBe('Captura')
  })
})

describe('confidenceLabel', () => {
  it('traduce la confianza', () => {
    expect(confidenceLabel('high')).toBe('confianza alta')
    expect(confidenceLabel('medium')).toBe('confianza media')
    expect(confidenceLabel('low')).toBe('confianza baja')
  })
  it('null/undefined → null', () => {
    expect(confidenceLabel(null)).toBeNull()
    expect(confidenceLabel(undefined)).toBeNull()
  })
})
