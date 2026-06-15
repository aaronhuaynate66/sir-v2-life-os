import { describe, it, expect } from 'vitest'
import { getExtractorSpec } from './extractors'
import { isValidDetectorResult } from './detector/validate'
import { CONVERSATION_CAPTURE_TYPES, storageBucketFor } from './observations/types'

describe('dm_conversation wiring', () => {
  it('tiene extractor (reusa el de whatsapp_chat)', () => {
    const spec = getExtractorSpec('dm_conversation')
    expect(spec).not.toBeNull()
    expect(typeof spec!.getSystemPrompt()).toBe('string')
    expect(spec!.maxTokens).toBeGreaterThan(0)
  })

  it('el detector acepta type=dm_conversation', () => {
    expect(isValidDetectorResult({
      type: 'dm_conversation', confidence: 'high',
      reasoning: 'burbujas + header con @handle', suggestedPersonName: 'dayrrit',
    })).toBe(true)
  })

  it('cuenta como conversación (interacción)', () => {
    expect(CONVERSATION_CAPTURE_TYPES).toContain('dm_conversation')
  })

  it('archiva el screenshot en un bucket', () => {
    expect(storageBucketFor('dm_conversation')).toBe('whatsapp-captures')
  })
})
