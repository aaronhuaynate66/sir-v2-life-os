import { describe, it, expect } from 'vitest'

import {
  assessExtraction,
  looksLikeFullPageProfileCapture,
  meaningfulFieldCount,
} from './legibility'

const RICH = { headline: 'Ing. Industrial', currentCompany: 'Acme', location: 'Lima' }

describe('meaningfulFieldCount', () => {
  it('cuenta solo campos con texto sustantivo; ignora flags/meta', () => {
    expect(meaningfulFieldCount({ headline: 'Ing. Industrial', currentCompany: 'Acme', isVerified: true, confidence: 'high' })).toBe(2)
    expect(meaningfulFieldCount({ handle: 'a', isPrivate: false })).toBe(0) // 'a' < 2 chars
    expect(meaningfulFieldCount({ topics: ['marketing', 'ventas'] })).toBe(1)
    expect(meaningfulFieldCount({ latestExperience: { title: 'CEO', name: 'X' } })).toBe(1)
    expect(meaningfulFieldCount({})).toBe(0)
  })
})

describe('assessExtraction', () => {
  it('confianza baja → unreadable (sin importar campos)', () => {
    expect(assessExtraction({ headline: 'Algo', company: 'Otra' }, 'low')).toBe('unreadable')
  })
  it('cero campos con sustancia → unreadable', () => {
    expect(assessExtraction({ confidence: 'high', isVerified: true }, 'high')).toBe('unreadable')
  })
  it('confianza media → review', () => {
    expect(assessExtraction({ headline: 'Ing.', currentCompany: 'Acme' }, 'medium')).toBe('review')
  })
  it('confianza desconocida (null) → review', () => {
    expect(assessExtraction({ headline: 'Ing.', currentCompany: 'Acme' }, null)).toBe('review')
  })
  it('alta confianza pero 1 solo campo → review (dudoso)', () => {
    expect(assessExtraction({ headline: 'Ing.' }, 'high')).toBe('review')
  })
  it('alta confianza + varios campos → ok', () => {
    expect(assessExtraction(RICH, 'high')).toBe('ok')
  })

  // ─── Señal modelo-independiente: el LLM mintió con 'high' sobre basura ───

  it('imageLegible=false → unreadable AUNQUE confianza alta + campos', () => {
    expect(assessExtraction({ ...RICH, imageLegible: false }, 'high')).toBe('unreadable')
  })

  it('imageLegible=true no penaliza (cae a la lógica normal)', () => {
    expect(assessExtraction({ ...RICH, imageLegible: true }, 'high')).toBe('ok')
  })

  it('dims de página entera (linkedin) → unreadable aunque confianza alta', () => {
    // El bug real: LinkedIn de página entera, height ≫ width, LLM dijo 'high'.
    expect(
      assessExtraction(RICH, 'high', { dims: { width: 800, height: 4000 }, captureType: 'linkedin' }),
    ).toBe('unreadable')
  })

  it('dims de pantalla única (no página entera) → no corta', () => {
    expect(
      assessExtraction(RICH, 'high', { dims: { width: 390, height: 844 }, captureType: 'linkedin' }),
    ).toBe('ok')
  })

  it('dims sin captureType o no-perfil → ignora el guard', () => {
    expect(
      assessExtraction(RICH, 'high', { dims: { width: 800, height: 4000 }, captureType: 'whatsapp_chat' }),
    ).toBe('ok')
  })
})

describe('looksLikeFullPageProfileCapture', () => {
  it('linkedin/instagram muy alto (ratio ≥ 3) → true', () => {
    expect(looksLikeFullPageProfileCapture({ width: 800, height: 4000 }, 'linkedin')).toBe(true)
    expect(looksLikeFullPageProfileCapture({ width: 500, height: 1600 }, 'instagram')).toBe(true)
  })
  it('pantalla única de teléfono (ratio ~2.16) → false', () => {
    expect(looksLikeFullPageProfileCapture({ width: 390, height: 844 }, 'linkedin')).toBe(false)
  })
  it('tipos no-perfil nunca disparan (chat puede ser largo legítimamente)', () => {
    expect(looksLikeFullPageProfileCapture({ width: 400, height: 4000 }, 'whatsapp_chat')).toBe(false)
  })
  it('dims faltantes/0 → false (graceful)', () => {
    expect(looksLikeFullPageProfileCapture(null, 'linkedin')).toBe(false)
    expect(looksLikeFullPageProfileCapture({ width: 0, height: 0 }, 'linkedin')).toBe(false)
  })
})
