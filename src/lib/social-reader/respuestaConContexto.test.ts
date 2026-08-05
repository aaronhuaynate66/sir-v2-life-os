import { describe, expect, it } from 'vitest'

import { nombreLimpio, pareceUnNombre, recorteDeNombre, VENTANA_MINUTOS } from './preguntaAbierta'

describe('la respuesta REAL de Aaron, 5-ago-2026', () => {
  const REAL = 'Piero López Quintana, es un amigo de colegio de secundaria'

  it('se acepta — antes la rechazaba por tener 10 palabras', () => {
    expect(pareceUnNombre(REAL)).toBe(true)
  })

  it('guarda solo el NOMBRE, no la frase entera', () => {
    // De haber enganchado con el código viejo, la persona se habría llamado
    // "Piero López Quintana, es un amigo de colegio de secundaria".
    expect(nombreLimpio(REAL)).toBe('Piero López Quintana')
  })

  it('la ventana cubre "respondo a la mañana"', () => {
    // Tarjeta 21:23, respuesta 08:44 → 11 h 21 min. Con 30 minutos no llegaba.
    expect(VENTANA_MINUTOS).toBeGreaterThan(11 * 60 + 21)
  })
})

describe('recorteDeNombre', () => {
  it('corta en la coma y en el conector', () => {
    expect(recorteDeNombre('Ana María Solís, mi prima')).toBe('Ana María Solís')
    expect(recorteDeNombre('Diego Ruiz que trabaja en K2')).toBe('Diego Ruiz')
    expect(recorteDeNombre('Marcos es un compañero')).toBe('Marcos')
  })

  it('quita el prefijo conversacional', () => {
    expect(recorteDeNombre('es Pedro Valera')).toBe('Pedro Valera')
    expect(recorteDeNombre('se llama Lucía')).toBe('Lucía')
  })

  it('un nombre pelado queda igual', () => {
    expect(recorteDeNombre('Piero')).toBe('Piero')
    expect(recorteDeNombre('  Juan  de  la  Cruz  ')).toBe('Juan de la Cruz')
  })
})

describe('pareceUnNombre — lo que SIGUE rechazando', () => {
  it('preguntas y pedidos, aunque tengan forma de frase corta', () => {
    for (const t of ['¿quién es?', 'qué tengo mañana', 'búscame a Diana', 'dime la hora', 'manda el correo']) {
      expect(pareceUnNombre(t), t).toBe(false)
    }
  })

  it('una orden con coma NO se cuela por el recorte', () => {
    // El recorte da "Pásame el informe" y cae por la minúscula de "informe":
    // lo que protege ya no es el largo, es la FORMA de nombre propio.
    expect(pareceUnNombre('Pásame el informe, por favor')).toBe(false)
    expect(pareceUnNombre('avísame cuando puedas, gracias')).toBe(false)
  })

  it('texto en minúscula no es un nombre propio', () => {
    expect(pareceUnNombre('no sé quien es')).toBe(false)
    expect(pareceUnNombre('ni idea')).toBe(false)
  })

  it('saltos de línea y textos enormes siguen fuera', () => {
    expect(pareceUnNombre('Piero\nLópez')).toBe(false)
    expect(pareceUnNombre('A'.repeat(250))).toBe(false)
  })
})

describe('pareceUnNombre — lo que ahora SÍ acepta', () => {
  it('nombres con partículas', () => {
    expect(pareceUnNombre('Juan de la Cruz')).toBe(true)
    expect(pareceUnNombre('María del Carmen Ríos')).toBe(true)
  })

  it('un nombre con explicación detrás, que es como responde la gente', () => {
    expect(pareceUnNombre('Ana María Solís, mi prima de Trujillo')).toBe(true)
    expect(pareceUnNombre('Diego Ruiz que trabaja conmigo en K2')).toBe(true)
  })

  it('el nombre solo, como antes', () => {
    expect(pareceUnNombre('Piero López Quintana')).toBe(true)
    expect(pareceUnNombre('Lucía')).toBe(true)
  })
})
