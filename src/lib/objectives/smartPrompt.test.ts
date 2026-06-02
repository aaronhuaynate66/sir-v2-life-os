// SIR V2 — Tests del prompt/parser del helper "Hacer SMART".

import { describe, it, expect } from 'vitest'

import { buildSmartInput, parseSmart } from './smartPrompt'

describe('buildSmartInput', () => {
  it('incluye título, dominio, descripción, hoy y pide sugerir fecha si no hay', () => {
    const msg = buildSmartInput({
      title: 'Estar en forma',
      description: 'quiero sentirme mejor',
      category: 'health',
      today: '2026-06-01',
    })
    expect(msg).toContain('Estar en forma')
    expect(msg).toContain('Dominio: health')
    expect(msg).toContain('Hoy es: 2026-06-01')
    expect(msg).toContain('sugerí una realista')
  })

  it('si ya hay fecha → pide no sugerir otra', () => {
    const msg = buildSmartInput({ title: 'Ahorrar', targetDate: '2026-12-31', today: '2026-06-01' })
    expect(msg).toContain('Ya tiene fecha objetivo: 2026-12-31')
  })

  it('con context (grounding) pide inferir el baseline de los datos reales', () => {
    const msg = buildSmartInput({
      title: 'Bajar de peso',
      today: '2026-06-01',
      context: 'DATOS REALES DEL USUARIO:\n- Cuerpo (báscula): peso 82 kg.',
    })
    expect(msg).toContain('peso 82 kg')
    expect(msg).toContain('Inferí "baseline" de esos DATOS REALES')
  })

  it('modo dictado → usa el párrafo libre como fuente', () => {
    const msg = buildSmartInput({
      title: '',
      today: '2026-06-01',
      dictation: 'Quiero ahorrar para un fondo de emergencia este año',
    })
    expect(msg).toContain('extraé los campos SMART')
    expect(msg).toContain('fondo de emergencia')
  })
})

describe('parseSmart', () => {
  it('parsea JSON completo', () => {
    const raw = JSON.stringify({
      target: 'Pesar 75 kg',
      baseline: '82 kg',
      why: 'Quiero competir en mi categoría',
      suggestedTargetDate: '2026-11-01',
    })
    expect(parseSmart(raw)).toEqual({
      target: 'Pesar 75 kg',
      baseline: '82 kg',
      why: 'Quiero competir en mi categoría',
      suggestedTargetDate: '2026-11-01',
    })
  })

  it('extrae specific cuando viene; lo omite si está vacío', () => {
    const withSpec = parseSmart(JSON.stringify({ specific: 'Pesar 75 kg para competir', target: 'Pesar 75 kg', why: 'X' }))
    expect(withSpec?.specific).toBe('Pesar 75 kg para competir')
    const noSpec = parseSmart(JSON.stringify({ specific: '', target: 'Pesar 75 kg', why: 'X' }))
    expect(noSpec?.specific).toBeUndefined()
  })

  it('tolera markdown/ruido alrededor del JSON', () => {
    const raw = 'Acá tenés:\n```json\n{ "target": "Ahorrar S/5000", "why": "Fondo de emergencia" }\n```'
    const smart = parseSmart(raw)
    expect(smart?.target).toBe('Ahorrar S/5000')
    expect(smart?.why).toBe('Fondo de emergencia')
  })

  it('baseline vacío → undefined; fecha sugerida vacía → undefined', () => {
    const raw = JSON.stringify({ target: 'X', baseline: '', why: 'Y', suggestedTargetDate: '' })
    const smart = parseSmart(raw)!
    expect(smart.baseline).toBeUndefined()
    expect(smart.suggestedTargetDate).toBeUndefined()
  })

  it('ignora suggestedTargetDate con formato inválido', () => {
    const raw = JSON.stringify({ target: 'X', why: 'Y', suggestedTargetDate: 'noviembre' })
    expect(parseSmart(raw)!.suggestedTargetDate).toBeUndefined()
  })

  it('sin target usable → null', () => {
    expect(parseSmart(JSON.stringify({ baseline: '1', why: 'z' }))).toBeNull()
    expect(parseSmart(JSON.stringify({ target: '   ' }))).toBeNull()
    expect(parseSmart('no json')).toBeNull()
    expect(parseSmart('')).toBeNull()
  })
})
