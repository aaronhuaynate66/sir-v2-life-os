import { describe, it, expect } from 'vitest'
import {
  handleCore, nameTokens, scoreHandleAgainstName, suggestForHandle,
  looksLikeBusinessHandle, UMBRAL_SUGERENCIA, type SuggestCandidate,
} from './handleSuggest'

// Contactos REALES de la red de Aaron (nombres tal como están en la base).
const CONTACTOS: SuggestCandidate[] = [
  { id: 'p1', name: 'Laura Alfaro' },
  { id: 'p2', name: 'Miluska Castillo' },
  { id: 'p3', name: 'Dayana Yrribarren' },
  { id: 'p4', name: 'Diana Carolina Díaz Sánchez' },
  { id: 'p5', name: 'Maria Isabel Espinoza Vidaurre' },
  { id: 'p6', name: 'Jorge Castillo' },
  { id: 'p7', name: 'Laura Silva Bringas' },
]

describe('handleCore', () => {
  it('saca @, dígitos, puntos y guiones', () => {
    expect(handleCore('@dayana.rr_12')).toBe('dayanarr')
    expect(handleCore('raquel.2flores')).toBe('raquelflores')
  })
  it('normaliza tildes', () => {
    expect(handleCore('@josé.pérez')).toBe('joseperez')
  })
})

describe('nameTokens', () => {
  it('parte el nombre y descarta partículas', () => {
    expect(nameTokens('Maria de los Angeles Díaz')).toEqual(['maria', 'angeles', 'diaz'])
  })
})

describe('scoreHandleAgainstName', () => {
  it('concatenación exacta = 100', () => {
    expect(scoreHandleAgainstName('@miluskacastillo', 'Miluska Castillo').score).toBe(100)
  })

  it('nombre + apellido completo dentro del handle', () => {
    const r = scoreHandleAgainstName('@dayanayrribarren_ok', 'Dayana Yrribarren')
    expect(r.score).toBeGreaterThanOrEqual(92)
    expect(r.reason).toContain('yrribarren')
  })

  it('nombre + apellido abreviado: el caso @lauralfaroh', () => {
    const r = scoreHandleAgainstName('@lauralfaroh', 'Laura Alfaro')
    expect(r.score).toBeGreaterThanOrEqual(UMBRAL_SUGERENCIA)
  })

  it('solo el nombre de pila puntúa BAJO (hay muchas Dianas)', () => {
    const r = scoreHandleAgainstName('@diana_bonita', 'Diana Carolina Díaz Sánchez')
    expect(r.score).toBeLessThan(80)
    expect(r.reason).toMatch(/puede ser otra persona/)
  })

  it('solo el apellido avisa que podría ser un familiar', () => {
    const r = scoreHandleAgainstName('@castillo.oficial', 'Jorge Castillo')
    expect(r.reason).toMatch(/familiar/)
  })

  it('un handle sin relación no puntúa', () => {
    for (const h of ['@waikikiloco', '@dayrrit', '@brei_peru', '@juanchang3756']) {
      expect(scoreHandleAgainstName(h, 'Laura Alfaro').score, h).toBe(0)
    }
  })

  it('no explota con entradas vacías', () => {
    expect(scoreHandleAgainstName('', 'Laura Alfaro').score).toBe(0)
    expect(scoreHandleAgainstName('@laura', '').score).toBe(0)
  })
})

describe('suggestForHandle', () => {
  it('resuelve el handle al contacto correcto', () => {
    expect(suggestForHandle('@miluskacastillo', CONTACTOS)?.candidate.name).toBe('Miluska Castillo')
    expect(suggestForHandle('@lauralfaroh', CONTACTOS)?.candidate.name).toBe('Laura Alfaro')
  })

  it('no sugiere nada cuando el handle no dice nada', () => {
    // El caso real de la bandeja de Aaron: handles no parlantes.
    for (const h of ['@dayrrit', '@waikikiloco', '@brei_peru', '@ivcdlc_oficial']) {
      expect(suggestForHandle(h, CONTACTOS), h).toBeNull()
    }
  })

  // REGRESIÓN de los 8 falsos positivos reales que salieron con el umbral en 55.
  // Todos eran del tramo "solo el nombre de pila", que matchea SUBCADENAS.
  it('no cae en los falsos positivos por subcadena que se midieron en su data', () => {
    const conCarlo: SuggestCandidate[] = [...CONTACTOS, { id: 'p8', name: 'Carlo Rodríguez' }, { id: 'p9', name: 'Kevin Jimenez Velasquez' }]
    for (const h of [
      '@giancarlopostigo',        // el "carlo" vive dentro de "giancarlo"
      '@carlosampuerooficial',    // es Carlos Ampuero, no Carlo Rodríguez
      '@carlo_pezo',              // otro Carlo
      '@carloscjulve',            // Carlos C. Julve
      '@jimenezabogados.legal',   // un estudio de abogados, no una persona
    ]) {
      expect(suggestForHandle(h, conCarlo), h).toBeNull()
    }
  })

  it('pero SÍ sugiere cuando nombre y apellido están los dos', () => {
    const conCarlo: SuggestCandidate[] = [...CONTACTOS, { id: 'p8', name: 'Carlo Rodríguez' }]
    expect(suggestForHandle('@carlorodriguez', conCarlo)?.candidate.name).toBe('Carlo Rodríguez')
  })

  it('ante EMPATE devuelve null en vez de elegir al azar', () => {
    // "@laura.b" encaja igual de flojo con Laura Alfaro y con Laura Silva:
    // sugerir una invitaría a confirmar sin mirar.
    const empate: SuggestCandidate[] = [{ id: 'a', name: 'Laura Alfaro' }, { id: 'b', name: 'Laura Silva' }]
    expect(suggestForHandle('@laurita', empate)).toBeNull()
  })

  it('el empate NO bloquea cuando una gana claramente', () => {
    const s = suggestForHandle('@lauraalfaro', [{ id: 'a', name: 'Laura Alfaro' }, { id: 'b', name: 'Laura Silva' }])
    expect(s?.candidate.name).toBe('Laura Alfaro')
  })

  it('sin candidatos devuelve null', () => {
    expect(suggestForHandle('@miluskacastillo', [])).toBeNull()
  })
})

describe('looksLikeBusinessHandle', () => {
  it('caza los negocios de la bandeja real', () => {
    for (const h of ['@limagrupoinmobiliario', '@centroelectronicoelera', '@candelaperu.pe', '@ivcdlc_oficial', '@brei_peru']) {
      expect(looksLikeBusinessHandle(h), h).not.toBeNull()
    }
  })
  it('no marca handles de personas', () => {
    for (const h of ['@dayrrit', '@miluskacastillo', '@alberto.gsalas', '@juanchang3756']) {
      expect(looksLikeBusinessHandle(h), h).toBeNull()
    }
  })
  it('dice QUÉ palabra lo marcó', () => {
    // Nombra "grupo" y no "lima": desde que la geo solo vale como SUFIJO,
    // "lima" al arranque de "limagrupoinmobiliario" ya no cuenta —y no hace
    // falta, porque la razón social sí está en el handle—.
    expect(looksLikeBusinessHandle('@limagrupoinmobiliario')).toContain('grupo')
  })
})

// REGRESIÓN: "spa" matcheaba dentro de "fra·spa·ravencedor" y marcaba como negocio
// una cuenta de frases motivacionales. Mismo error de subcadena que el "carlo"
// dentro de "giancarlo": tres letras caen dentro de cualquier palabra.
describe('looksLikeBusinessHandle — pistas cortas solo en borde', () => {
  it('no marca por una pista de 3 letras metida DENTRO de una palabra', () => {
    // El caso real: "spa" vive en "fra·SPA·ravencedor" (frases-para-vencedor).
    expect(looksLikeBusinessHandle('@frasesparavencedor_')).toBeNull()
    expect(looksLikeBusinessHandle('@lasrespuestas')).toBeNull()
  })

  it('LÍMITE CERRADO: si la palabra solo ARRANCA con la pista, ya NO se marca', () => {
    // Antes se marcaba y quedó anotado como límite conocido: "gymnasia" empieza
    // con "gym" y el arranque se contaba como borde. Al unificar el léxico se
    // dejó de contar el arranque —solo el token entero o su final—, así que
    // "gymnasia romántica" dejó de ser un gimnasio.
    //
    // El costo es simétrico y asumido: @gymtotal tampoco se marca por "gym". No
    // hay regla léxica que separe "gymnasia" de "gymtotal", y de los dos errores
    // posibles preferimos NO afirmar: una organización propuesta de más ensucia
    // el grafo de contactos, una no propuesta solo se queda en la cola.
    expect(looksLikeBusinessHandle('@gymnasiaromantica')).toBeNull()
  })
  it('sí marca cuando la pista corta está en un borde', () => {
    expect(looksLikeBusinessHandle('@k9_peru_sac')).not.toBeNull()
    expect(looksLikeBusinessHandle('@global_plastic_sac')).not.toBeNull()
    expect(looksLikeBusinessHandle('@spa_lima')).not.toBeNull()
  })
  it('las pistas de 4+ siguen valiendo como subcadena', () => {
    // "peru" al final de "cablemundoperu" es señal real y no hay separador.
    expect(looksLikeBusinessHandle('@cablemundoperu')).not.toBeNull()
    expect(looksLikeBusinessHandle('@corporacionaxion')).not.toBeNull()
  })
})
