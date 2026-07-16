import { describe, it, expect } from 'vitest'
import { planChain, tierFor, requestHasImages } from './router'
import { availableProviders, estimateCost } from './registry'
import type { LlmMessage, LlmProvider } from './types'

const IMG_MSG: LlmMessage = {
  role: 'user',
  content: [
    { type: 'image', source: { type: 'base64', mediaType: 'image/png', data: 'AAAA' } },
    { type: 'text', text: 'Extraer.' },
  ],
}

describe('tierFor', () => {
  it('infiere el tier de la tarea, con default balanced', () => {
    expect(tierFor('classify')).toBe('cheap')
    expect(tierFor('synthesis')).toBe('capable')
    expect(tierFor('sir_chat')).toBe('balanced')
    expect(tierFor('tarea_desconocida')).toBe('balanced')
  })
  it('el tier explícito gana', () => {
    expect(tierFor('classify', 'capable')).toBe('capable')
  })
})

describe('planChain', () => {
  const ALL: LlmProvider[] = ['anthropic', 'deepseek', 'qwen', 'zhipu', 'moonshot', 'openrouter']

  it('sin proveedores disponibles → chain vacía', () => {
    expect(planChain({ task: 'sir_chat', messages: [] }, [])).toEqual([])
  })

  it('cheap → el más barato primero (deepseek), Anthropic al final', () => {
    const chain = planChain({ task: 'classify', messages: [] }, ALL)
    expect(chain[0].provider).toBe('deepseek')
    expect(chain[chain.length - 1].provider).toBe('anthropic')
    // usa el modelId del tier cheap del proveedor
    expect(chain[0].model).toBe('deepseek-chat')
  })

  it('capable → calidad primero (Anthropic al frente si está)', () => {
    const chain = planChain({ task: 'synthesis', messages: [] }, ALL)
    expect(chain[0].provider).toBe('anthropic')
  })

  it('balanced → Anthropic al frente (fiabilidad; el OSS balanced daba timeout, bug 2026-07-16)', () => {
    const chain = planChain({ task: 'sir_chat', messages: [] }, ALL)
    expect(chain[0].provider).toBe('anthropic')
    expect(chain[0].model).toBe('claude-sonnet-4-5-20250929')
  })

  it('balanced sin Anthropic → cae al más barato disponible', () => {
    const chain = planChain({ task: 'sir_chat', messages: [] }, ['openrouter', 'qwen'])
    expect(chain[0].provider).toBe('qwen') // costRank 10 < openrouter 30
  })

  it('cheap NO cambia: sigue el más barato (ahorro intacto)', () => {
    const chain = planChain({ task: 'classify', messages: [] }, ['anthropic', 'openrouter'])
    expect(chain[0].provider).toBe('openrouter')
  })

  it('capable sin Anthropic → cae al más barato disponible', () => {
    const chain = planChain({ task: 'synthesis', messages: [] }, ['deepseek', 'qwen'])
    expect(chain[0].provider).toBe('deepseek')
  })

  it('proveedor forzado va primero si está disponible', () => {
    const chain = planChain({ task: 'classify', messages: [], provider: 'qwen' }, ALL)
    expect(chain[0].provider).toBe('qwen')
    // no se duplica
    expect(chain.filter((c) => c.provider === 'qwen')).toHaveLength(1)
  })

  it('proveedor+modelId forzados aplican solo al primer intento', () => {
    const chain = planChain({ task: 'sir_chat', messages: [], provider: 'anthropic', model: 'claude-opus-x' }, ALL)
    expect(chain[0]).toMatchObject({ provider: 'anthropic', model: 'claude-opus-x' })
  })

  it('proveedor forzado NO disponible → se ignora, sigue el orden normal', () => {
    const chain = planChain({ task: 'classify', messages: [], provider: 'anthropic' }, ['deepseek', 'qwen'])
    expect(chain[0].provider).toBe('deepseek')
    expect(chain.some((c) => c.provider === 'anthropic')).toBe(false)
  })

  it('la chain incluye fallbacks (más de un proveedor)', () => {
    const chain = planChain({ task: 'sir_chat', messages: [] }, ['deepseek', 'anthropic'])
    expect(chain.length).toBe(2)
  })

  it('visión → solo proveedores multimodales (hoy solo Anthropic)', () => {
    const chain = planChain({ task: 'extract', messages: [IMG_MSG] }, ALL)
    expect(chain.map((c) => c.provider)).toEqual(['anthropic'])
  })

  it('visión respeta el tier: cheap→Haiku, capable→Sonnet (ambos multimodales)', () => {
    const cheap = planChain({ task: 'extract', tier: 'cheap', messages: [IMG_MSG] }, ALL)
    expect(cheap[0].model).toBe('claude-haiku-4-5-20251001')
    const capable = planChain({ task: 'extract', tier: 'capable', messages: [IMG_MSG] }, ALL)
    expect(capable[0].model).toBe('claude-sonnet-4-5-20250929')
  })

  it('visión sin proveedor multimodal disponible → chain vacía', () => {
    const chain = planChain({ task: 'extract', messages: [IMG_MSG] }, ['deepseek', 'qwen'])
    expect(chain).toEqual([])
  })
})

describe('requestHasImages', () => {
  it('detecta imágenes en bloques mixtos', () => {
    expect(requestHasImages({ task: 'extract', messages: [IMG_MSG] })).toBe(true)
  })
  it('false para contenido de solo texto (string o bloques)', () => {
    expect(requestHasImages({ task: 'extract', messages: [{ role: 'user', content: 'hola' }] })).toBe(false)
    expect(
      requestHasImages({ task: 'extract', messages: [{ role: 'user', content: [{ type: 'text', text: 'hola' }] }] }),
    ).toBe(false)
  })
})

describe('availableProviders', () => {
  it('solo los que tienen su env key seteada', () => {
    const env: Record<string, string | undefined> = { DEEPSEEK_API_KEY: 'x', ANTHROPIC_API_KEY: '  ' }
    const av = availableProviders(env)
    expect(av).toContain('deepseek')
    expect(av).not.toContain('anthropic') // vacío/espacios no cuenta
    expect(av).not.toContain('qwen')
  })
})

describe('estimateCost', () => {
  it('calcula USD por tokens (deepseek barato << anthropic)', () => {
    const ds = estimateCost('deepseek', 1_000_000, 1_000_000)!
    const an = estimateCost('anthropic', 1_000_000, 1_000_000)!
    expect(ds).toBeCloseTo(0.28 + 0.42, 5)
    expect(an).toBeGreaterThan(ds)
  })
})
