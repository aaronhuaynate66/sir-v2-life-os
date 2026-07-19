import { describe, it, expect } from 'vitest'
import { parseStoryVision, STORY_VISION_SYSTEM } from './storyVision'

describe('STORY_VISION_SYSTEM', () => {
  it('prohíbe inventar y pide JSON', () => {
    expect(STORY_VISION_SYSTEM).toMatch(/anti-alucinaci/i)
    expect(STORY_VISION_SYSTEM).toMatch(/NUNCA inventes/i)
  })
})

describe('parseStoryVision', () => {
  it('story de IG con handle + caption (el caso Dayana)', () => {
    const r = parseStoryVision('{"isSocial":true,"platform":"instagram","handle":"@Dayrrit","name":"Dayana","text":"Una escapadita ✈️"}')
    expect(r?.isSocial).toBe(true)
    expect(r?.platform).toBe('instagram')
    expect(r?.handle).toBe('dayrrit') // sin @, minúsculas
    expect(r?.text).toContain('escapadita')
  })
  it('sin handle visible → null en handle, conserva name', () => {
    const r = parseStoryVision('{"isSocial":true,"platform":"instagram","handle":null,"name":"Dayana Yrribarren","text":null}')
    expect(r?.handle).toBeNull()
    expect(r?.name).toBe('Dayana Yrribarren')
  })
  it('no-social → isSocial false, platform other', () => {
    const r = parseStoryVision('{"isSocial":false,"platform":"other","handle":null,"name":null,"text":null}')
    expect(r?.isSocial).toBe(false)
    expect(r?.platform).toBe('other')
  })
  it('tolera prefill/fences', () => {
    expect(parseStoryVision('```json\n{"isSocial":true,"platform":"linkedin","handle":null,"name":"Alex","text":"COO en OpenMed"}\n```')?.name).toBe('Alex')
  })
  it('null si no parsea', () => {
    expect(parseStoryVision('nope')).toBeNull()
  })
})
