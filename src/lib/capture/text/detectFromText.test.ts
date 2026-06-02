import { describe, it, expect } from 'vitest'

import { detectCaptureTypeFromText, detectorResultFromText } from './detectFromText'

describe('detectCaptureTypeFromText', () => {
  it('texto de perfil LinkedIn → linkedin', () => {
    const text = `Diana Pérez
    Ingeniera Industrial en Acme
    Lima, Perú · 500+ conexiones
    Acerca de
    Lidero proyectos de mejora continua.
    Experiencia
    Jefa de Operaciones · Acme
    Aptitudes principales
    Lean, Six Sigma`
    const d = detectCaptureTypeFromText(text)
    expect(d.type).toBe('linkedin')
    expect(d.confidence).toBe('high')
  })

  it('texto de perfil Instagram → instagram', () => {
    const text = `@diana.fit
    1.234 publicaciones · 10,2 mil seguidores · 380 seguidos
    Editar perfil
    Historias destacadas
    Reels`
    const d = detectCaptureTypeFromText(text)
    expect(d.type).toBe('instagram')
    expect(d.confidence).toBe('high')
  })

  it("'seguidores'/'followers' solo NO alcanza (aparece en ambos)", () => {
    const d = detectCaptureTypeFromText('1.000 seguidores')
    expect(d.type).toBe('unknown')
    expect(d.confidence).toBe('low')
  })

  it('texto sin marcadores → unknown / low', () => {
    const d = detectCaptureTypeFromText('Hola, ¿cómo estás? Nos vemos el martes.')
    expect(d.type).toBe('unknown')
    expect(d.confidence).toBe('low')
    expect(d.scores).toEqual({ linkedin: 0, instagram: 0 })
  })

  it('case/acento-insensitive', () => {
    const d = detectCaptureTypeFromText('CONEXIONES · EXPERIENCIA · APTITUDES')
    expect(d.type).toBe('linkedin')
  })
})

describe('detectorResultFromText', () => {
  it('arma un DetectorResult válido con el tipo detectado', () => {
    const r = detectorResultFromText('Experiencia · Aptitudes · Conexiones')
    expect(r.type).toBe('linkedin')
    expect(r.suggestedPersonName).toBeNull()
    expect(typeof r.reasoning).toBe('string')
  })

  it('texto ambiguo cae al fallback', () => {
    expect(detectorResultFromText('texto cualquiera').type).toBe('linkedin')
    expect(detectorResultFromText('texto cualquiera', 'instagram').type).toBe('instagram')
  })
})
