import { describe, it, expect } from 'vitest'

import { inverseRoleLabel, composeKinds, categoryOf, KIND_LABEL } from './family'
import type { FamilyKind } from '@/types'

describe('inverseRoleLabel', () => {
  it('parent ↔ child', () => {
    expect(inverseRoleLabel('madre')).toBe('Hijo/a')
    expect(inverseRoleLabel('padre')).toBe('Hijo/a')
    expect(inverseRoleLabel('hijo')).toBe('Padre/Madre')
    expect(inverseRoleLabel('hija')).toBe('Padre/Madre')
  })

  it('sibling and partner are symmetric in category', () => {
    expect(inverseRoleLabel('hermano')).toBe('Hermano/a')
    expect(inverseRoleLabel('hermana')).toBe('Hermano/a')
    expect(inverseRoleLabel('pareja')).toBe('Pareja')
  })

  it('grandparent ↔ grandchild, aunt/uncle ↔ nibling', () => {
    expect(inverseRoleLabel('abuela')).toBe('Nieto/a')
    expect(inverseRoleLabel('tio')).toBe('Sobrino/a')
  })

  it('legacy "familiar" stays generic', () => {
    expect(inverseRoleLabel('familiar')).toBe('Familiar')
  })

  it('every FamilyKind has a label and an inverse', () => {
    const kinds = Object.keys(KIND_LABEL) as FamilyKind[]
    for (const k of kinds) {
      expect(KIND_LABEL[k]).toBeTruthy()
      expect(inverseRoleLabel(k)).toBeTruthy()
      expect(categoryOf(k)).toBeTruthy()
    }
  })
})

describe('composeKinds (inferencia transitiva)', () => {
  it('la madre de mi hermana es mi madre', () => {
    // B (hermana de A) → C (madre de B) ⇒ C es madre de A
    expect(composeKinds('hermana', 'madre')).toBe('madre')
    expect(composeKinds('hermano', 'padre')).toBe('padre')
  })

  it('el hermano de mi hermano es mi hermano', () => {
    expect(composeKinds('hermano', 'hermano')).toBe('hermano')
    expect(composeKinds('hermana', 'hermana')).toBe('hermana')
  })

  it('la madre de mi madre es mi abuela', () => {
    expect(composeKinds('madre', 'madre')).toBe('abuela')
    expect(composeKinds('madre', 'padre')).toBe('abuelo')
    expect(composeKinds('padre', 'madre')).toBe('abuela')
  })

  it('el hermano de mi madre es mi tío', () => {
    expect(composeKinds('madre', 'hermano')).toBe('tio')
    expect(composeKinds('padre', 'hermana')).toBe('tia')
  })

  it('la hija de mi madre es mi hermana (inversa con el self)', () => {
    expect(composeKinds('madre', 'hija')).toBe('hermana')
    expect(composeKinds('padre', 'hijo')).toBe('hermano')
  })

  it('no infiere lo arriesgado (devuelve null)', () => {
    expect(composeKinds('pareja', 'madre')).toBeNull()
    expect(composeKinds('madre', 'pareja')).toBeNull()
    expect(composeKinds('amigo', 'amiga')).toBeNull()
    expect(composeKinds('hijo', 'hija')).toBeNull()
  })
})
