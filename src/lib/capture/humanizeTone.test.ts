import { describe, it, expect } from 'vitest'

import { humanizeTone } from './humanizeTone'

describe('humanizeTone', () => {
  it('traduce y separa el enum combinado con +', () => {
    expect(humanizeTone('affectionate_routine+supportive')).toBe('cariñoso, rutinario, de apoyo')
  })

  it('traduce un token simple', () => {
    expect(humanizeTone('tense')).toBe('tenso')
  })

  it('deja limpio (sin crudo) un token desconocido', () => {
    expect(humanizeTone('foo_bar')).toBe('foo, bar')
  })

  it('dedup preservando orden', () => {
    expect(humanizeTone('warm+warm_neutral')).toBe('cálido, neutral')
  })

  it('vacío/null → cadena vacía', () => {
    expect(humanizeTone('')).toBe('')
    expect(humanizeTone(null)).toBe('')
    expect(humanizeTone(undefined)).toBe('')
  })
})
