import { describe, it, expect } from 'vitest'

import {
  normalizarComando, esCanal, elegirParaEntregar, normalizarProbe,
  lectorVivo, probeLine, MAX_DIAS, DIAS_POR_DEFECTO, MAX_POR_LATIDO,
  type Comando, type Probe,
} from './comandos'

describe('normalizarComando', () => {
  it('acepta resync con días y chat', () => {
    expect(normalizarComando({ kind: 'resync', dias: 120, chat: 'Diana Carolina' }))
      .toEqual({ kind: 'resync', params: { dias: 120, chat: 'Diana Carolina' } })
  })

  it('resync sin días usa el default (el backfill de hoy)', () => {
    expect(normalizarComando({ kind: 'resync' })?.params.dias).toBe(DIAS_POR_DEFECTO)
  })

  it('recorta los días al techo y al piso', () => {
    expect(normalizarComando({ kind: 'resync', dias: 99999 })?.params.dias).toBe(MAX_DIAS)
    expect(normalizarComando({ kind: 'resync', dias: 0 })?.params.dias).toBe(1)
    expect(normalizarComando({ kind: 'resync', dias: -5 })?.params.dias).toBe(1)
  })

  it('días no entero cae al default en vez de romper', () => {
    expect(normalizarComando({ kind: 'resync', dias: 1.5 })?.params.dias).toBe(DIAS_POR_DEFECTO)
    expect(normalizarComando({ kind: 'resync', dias: 'muchos' })?.params.dias).toBe(DIAS_POR_DEFECTO)
  })

  it('probe no lleva params', () => {
    expect(normalizarComando({ kind: 'probe', dias: 90 })).toEqual({ kind: 'probe', params: {} })
  })

  it('RECHAZA cualquier kind desconocido — el set es cerrado a propósito', () => {
    // Un comando de texto libre ejecutándose en el navegador de Aaron es una
    // superficie que no se abre por comodidad.
    for (const malo of [
      { kind: 'eval' }, { kind: 'sendMessage' }, { kind: 'openTab' },
      { kind: '' }, { kind: 42 }, {}, null, undefined, 'resync', [],
    ]) {
      expect(normalizarComando(malo), JSON.stringify(malo)).toBeNull()
    }
  })

  it('acepta params anidados además de planos', () => {
    expect(normalizarComando({ kind: 'resync', params: { dias: 90, chat: 'X' } }))
      .toEqual({ kind: 'resync', params: { dias: 90, chat: 'X' } })
  })

  it('recorta el nombre del chat y descarta vacíos', () => {
    expect(normalizarComando({ kind: 'resync', chat: '  ' })?.params.chat).toBeUndefined()
    expect(normalizarComando({ kind: 'resync', chat: 'x'.repeat(500) })?.params.chat).toHaveLength(120)
  })
})

describe('esCanal', () => {
  it('acepta los del latido y rechaza el resto', () => {
    for (const c of ['whatsapp', 'instagram', 'linkedin', 'teams', 'outlook']) expect(esCanal(c)).toBe(true)
    for (const c of ['facebook', 'WHATSAPP', '', null, 7]) expect(esCanal(c)).toBe(false)
  })
})

describe('elegirParaEntregar', () => {
  const c = (id: string): Comando => ({ id, kind: 'resync', params: {} })

  it('entrega UNO por latido: el resync barre 300 chats y dos se pisarían', () => {
    expect(elegirParaEntregar([c('a'), c('b'), c('c')])).toHaveLength(MAX_POR_LATIDO)
    expect(elegirParaEntregar([c('a'), c('b')])[0].id).toBe('a')
  })

  it('vacío y basura no rompen', () => {
    expect(elegirParaEntregar([])).toEqual([])
    expect(elegirParaEntregar(null as unknown as Comando[])).toEqual([])
    expect(elegirParaEntregar([{ id: '', kind: 'resync', params: {} }])).toEqual([])
  })
})

describe('normalizarProbe', () => {
  it('tipa y recorta lo que llega del navegador', () => {
    expect(normalizarProbe({ lib: 'object', ready: true, chats: 211, libVersion: '4.4.1' }))
      .toEqual({ lib: 'object', ready: true, chats: 211, libVersion: '4.4.1' })
  })

  it('descarta campos con tipo equivocado sin tirar todo', () => {
    expect(normalizarProbe({ lib: 'object', ready: 'sí', chats: 'muchos' })).toEqual({ lib: 'object' })
  })

  it('recorta strings largos y topa el conteo', () => {
    const p = normalizarProbe({ error: 'x'.repeat(900), chats: 9_999_999 })!
    expect(p.error).toHaveLength(300)
    expect(p.chats).toBe(100_000)
  })

  it('sin nada reconocible devuelve null', () => {
    expect(normalizarProbe({})).toBeNull()
    expect(normalizarProbe(null)).toBeNull()
    expect(normalizarProbe('probe')).toBeNull()
  })
})

describe('lectorVivo — cierra el hueco de los 4 días', () => {
  it('sin probe devuelve null, y null NO es "sano"', () => {
    // Regla de honestidad de cobertura: "no sé" no se lee como "está bien".
    expect(lectorVivo(null)).toBeNull()
    expect(lectorVivo(undefined)).toBeNull()
  })

  it('la librería no cargó → NO está leyendo, esté la pestaña como esté', () => {
    // Este es exactamente el caso del 26→30 jul: pestaña abierta, latido 'ok',
    // lector muerto.
    expect(lectorVivo({ lib: 'undefined' })).toBe(false)
  })

  it('Store no listo → no está leyendo', () => {
    expect(lectorVivo({ lib: 'object', ready: false })).toBe(false)
  })

  it('cargó, listo, pero 0 chats → tampoco (es el race del #782)', () => {
    expect(lectorVivo({ lib: 'object', ready: true, chats: 0 })).toBe(false)
  })

  it('un error reportado manda sobre todo lo demás', () => {
    expect(lectorVivo({ lib: 'object', ready: true, chats: 211, error: 'getMessages falló' })).toBe(false)
  })

  it('cargó, listo y con chats → vivo', () => {
    expect(lectorVivo({ lib: 'object', ready: true, chats: 211 })).toBe(true)
  })

  it('EL CASO DEL 30-jul: lista chats pero NO puede leer mensajes → no vivo', () => {
    // Medido en la otra PC: WPP object, ready true, 1123 chats listados… y
    // `getMessages` roto contra la versión de WhatsApp de ese día. El reader recorrió
    // 196 chats y mandó 0 mensajes, con todo lo demás en verde. Sin este campo, el
    // diagnóstico habría dicho "leyendo (1123 chats)" mientras no traía nada.
    expect(lectorVivo({ lib: 'object', ready: true, chats: 1123, lee: 'ninguno' })).toBe(false)
  })

  it('si lee por un camino alternativo, sigue vivo', () => {
    expect(lectorVivo({ lib: 'object', ready: true, chats: 1123, lee: 'chat.msgs.getModelsArray', leeCuantos: 5 }))
      .toBe(true)
  })
})

describe('probeLine', () => {
  it('distingue "pestaña abierta" de "lector leyendo" — la frase que faltaba', () => {
    const l = probeLine('WhatsApp', { lib: 'undefined' })!
    expect(l).toMatch(/pestaña está abierta pero el lector NO está leyendo/)
    expect(l).toMatch(/librería del Store no cargó/)
  })

  it('sin diagnóstico dice que no sabe, no que está bien', () => {
    expect(probeLine('WhatsApp', null)).toMatch(/no sé si está leyendo/)
  })

  it('vivo lo dice con el conteo', () => {
    expect(probeLine('WhatsApp', { lib: 'object', ready: true, chats: 211 }))
      .toMatch(/leyendo \(211 chats a la vista\)/)
  })

  it('nombra el motivo cuando lo hay', () => {
    expect(probeLine('WhatsApp', { lib: 'object', ready: true, chats: 211, error: 'boom' })).toMatch(/boom/)
    expect(probeLine('WhatsApp', { lib: 'object', ready: true, chats: 0 })).toMatch(/0 chats/)
  })
})

// ═══ LECTORES PASIVOS (Instagram) ═══════════════════════════════════════════
//
// Aaron, 4-ago-2026, sobre "Instagram está corriendo pero hace 4 días que no trae
// nada": *"entonces no entiendo si sirve o no sirve, qué hacemos"*. La pregunta era
// correcta y el sistema no podía responderla. Estos casos son las TRES causas que
// antes se veían idénticas desde afuera.
describe('probe de un lector PASIVO: separa "roto" de "no lo abriste"', () => {
  const ig = (over: Record<string, unknown> = {}) =>
    ({ reader: 'instagram-pasivo', hooked: true, loggedIn: true, vistos: 0, desdeMin: 120, haceMin: null, ...over }) as Probe

  it('hooks caídos → NO está vivo, y lo dice como falla', () => {
    expect(lectorVivo(ig({ hooked: false }))).toBe(false)
    const l = probeLine('Instagram', ig({ hooked: false }))!
    expect(l).toContain('NO está enganchado')
    expect(l).toContain('recargar')
  })

  it('sesión caída → NO está vivo, y manda a iniciar sesión', () => {
    expect(lectorVivo(ig({ loggedIn: false }))).toBe(false)
    expect(probeLine('Instagram', ig({ loggedIn: false }))!).toContain('iniciar sesión')
  })

  it('enganchado y capturando → leyendo, con cuántas y hace cuánto', () => {
    expect(lectorVivo(ig({ vistos: 12, haceMin: 3 }))).toBe(true)
    const l = probeLine('Instagram', ig({ vistos: 12, haceMin: 3 }))!
    expect(l).toContain('leyendo (12 capturas')
    expect(l).toContain('hace 3 min')
  })

  it('EL CASO QUE MOTIVÓ TODO: sano, 0 capturas → "no es una falla"', () => {
    // Antes esto salía como "corriendo pero hace 4 días que no trae nada", que no
    // distinguía nada. Ahora dice la causa y que no hay que arreglar nada.
    expect(lectorVivo(ig({ vistos: 0 }))).toBe(true)
    const l = probeLine('Instagram', ig({ vistos: 0 }))!
    expect(l).toContain('no has abierto Instagram')
    expect(l).toContain('No es una falla')
    expect(l).toContain('hace 120 min')
  })

  it('loggedIn null es "no sé": no lo declara caído por no poder mirar la cookie', () => {
    expect(lectorVivo(ig({ loggedIn: null }))).toBe(true)
  })

  it('un error reportado gana sobre todo lo demás', () => {
    expect(lectorVivo(ig({ error: 'algo explotó' }))).toBe(false)
  })

  it('no rompe el probe de WhatsApp: sin `hooked` sigue el camino de wa-js', () => {
    expect(lectorVivo({ lib: 'object', ready: true, chats: 1127 } as Probe)).toBe(true)
    expect(probeLine('WhatsApp', { lib: 'object', ready: true, chats: 1127 } as Probe))
      .toContain('1127 chats a la vista')
  })
})
