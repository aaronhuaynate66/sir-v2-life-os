// SIR V2 — Tests de la inteligencia de medicación.

import { describe, it, expect } from 'vitest'
import { classifyMed, deriveMigraineDays, registryMap, medMeaning } from './classify'

describe('classifyMed — por nombre (fallback sin desglose)', () => {
  it('ergotamina / Ergonex → antimigrañoso y señal de migraña', () => {
    expect(classifyMed('Ergonex Plus')).toMatchObject({ class: 'antimigraine', isMigraineMed: true })
    expect(classifyMed('ergotamina')).toMatchObject({ isMigraineMed: true })
    expect(classifyMed('Sumatriptán 50mg')).toMatchObject({ class: 'antimigraine', isMigraineMed: true })
  })
  it('analgésico general NO es señal de migraña', () => {
    expect(classifyMed('ibuprofeno')).toMatchObject({ class: 'analgesic', isMigraineMed: false })
    expect(classifyMed('Paracetamol')).toMatchObject({ class: 'analgesic', isMigraineMed: false })
  })
  it('suplementos → supplement', () => {
    expect(classifyMed('Magnesio')).toMatchObject({ class: 'supplement', isMigraineMed: false })
    expect(classifyMed('Vitamina D')).toMatchObject({ class: 'supplement' })
  })
  it('desconocido → other, no migraña', () => {
    expect(classifyMed('Xyzzy')).toMatchObject({ class: 'other', isMigraineMed: false })
  })
})

describe('classifyMed — el desglose del usuario manda', () => {
  it('composición con ergotamina clasifica antimigraña aunque el nombre sea genérico', () => {
    const info = classifyMed('Pastilla azul', { name: 'Pastilla azul', component: 'ergotamina tartrato 1mg + cafeína 100mg' })
    expect(info).toMatchObject({ class: 'antimigraine', isMigraineMed: true })
    expect(info.component).toContain('ergotamina')
  })
  it('treats="migraña" marca señal de migraña aunque la clase no sea explícita', () => {
    expect(classifyMed('MedX', { name: 'MedX', treats: 'migraña' })).toMatchObject({ isMigraineMed: true })
  })
  it('drugClass declarado por el usuario se respeta', () => {
    expect(classifyMed('MedY', { name: 'MedY', drugClass: 'Analgésico' })).toMatchObject({ class: 'analgesic', isMigraineMed: false })
  })
})

describe('deriveMigraineDays — solo cuentan los antimigrañosos', () => {
  const reg = registryMap([
    { name: 'Ergonex Plus', component: 'ergotamina + cafeína', drugClass: 'antimigrañoso', treats: 'migraña' },
    { name: 'Ibuprofeno', drugClass: 'analgésico' },
  ])
  it('un día con ergotamina cuenta; uno con solo ibuprofeno NO', () => {
    const days = deriveMigraineDays([
      { name: 'Ergonex Plus', taken_at: '2026-07-02T08:01:00-05:00' },
      { name: 'Ibuprofeno', taken_at: '2026-07-03T10:00:00-05:00' },
      { name: 'Magnesio', taken_at: '2026-07-04T22:00:00-05:00' },
    ], reg)
    expect(days.has('2026-07-02')).toBe(true)
    expect(days.has('2026-07-03')).toBe(false)
    expect(days.has('2026-07-04')).toBe(false)
    expect(days.size).toBe(1)
  })
  it('sin registry cae al fallback por nombre (Ergonex igual cuenta)', () => {
    const days = deriveMigraineDays([{ name: 'Ergonex Plus', taken_at: '2026-07-02' }], new Map())
    expect(days.has('2026-07-02')).toBe(true)
  })
  it('ignora tomas sin fecha', () => {
    expect(deriveMigraineDays([{ name: 'Ergonex', taken_at: '' }], new Map()).size).toBe(0)
  })
})

describe('medMeaning', () => {
  it('antimigrañoso muestra señal de migraña + composición', () => {
    expect(medMeaning('Ergonex Plus', { name: 'Ergonex Plus', component: 'ergotamina + cafeína' }))
      .toContain('señal de migraña')
  })
  it('no-migraña muestra clase (+ para qué)', () => {
    expect(medMeaning('Ibuprofeno', { name: 'Ibuprofeno', treats: 'dolor' })).toBe('analgésico · dolor')
  })
})
