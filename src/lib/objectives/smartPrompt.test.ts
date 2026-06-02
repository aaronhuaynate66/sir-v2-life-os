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
