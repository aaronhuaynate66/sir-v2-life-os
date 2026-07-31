import { describe, it, expect } from 'vitest'

import { limaWallClock, chatMessageId } from '@/lib/chat-messages/append'
import type { ReaderBatch } from '@/lib/reader/ingest'

/**
 * Réplica exacta de la línea de `persist.ts` que decide el timestamp. Se testea acá
 * porque `ingestReaderBatch` necesita Supabase y esta decisión es pura.
 */
const isoParaGuardar = (batch: Pick<ReaderBatch, 'tsKind'>, ts: string | null) =>
  batch.tsKind === 'instant' ? limaWallClock(ts) : ts

describe('tsKind — el desfase de 5 h de Teams', () => {
  // 27-jul 20:30 UTC = 15:30 hora de pared de Lima.
  const INSTANTE = '2026-07-27T20:30:00.000Z'
  const PARED = '2026-07-27T15:30:00.000Z'

  it('un lote de INSTANTES se convierte a hora de pared', () => {
    expect(isoParaGuardar({ tsKind: 'instant' }, INSTANTE)).toBe(PARED)
  })

  it('un lote de hora de PARED pasa intacto', () => {
    expect(isoParaGuardar({ tsKind: 'wall' }, PARED)).toBe(PARED)
  })

  it('SIN tsKind se trata como pared — el default no puede romper a los que ya andaban', () => {
    // El scraper DOM de WhatsApp y el lector del Store ya mandan hora de pared (uno
    // lee la hora mostrada, el otro convierte del lado del cliente). Si el default
    // fuera 'instant', se les restarían 5 h de nuevo y quedarían 10 h corridos:
    // peor que el bug original y mucho más difícil de ver.
    expect(isoParaGuardar({}, PARED)).toBe(PARED)
  })

  it('convertir DOS veces deja 10 h de error — por eso el default importa', () => {
    const unaVez = limaWallClock(INSTANTE)!
    const dosVeces = limaWallClock(unaVez)!
    const horas = (Date.parse(INSTANTE) - Date.parse(dosVeces)) / 3_600_000
    expect(horas).toBe(10)
  })

  it('EL BUG: el mismo mensaje por Teams y por otra vía colapsa al MISMO id', () => {
    // Este es el punto de todo el arreglo. Antes, el mismo mensaje capturado por
    // Teams (instante real) y el mismo texto llegando en hora de pared producían dos
    // ids distintos porque el hash toma el minuto — para la base eran dos instantes
    // diferentes y ningún dedupe podía cruzarlos.
    const args = ['u1', 'p1', 'teams', null as string | null, 'other' as const, 'hola']
    const idTeams = chatMessageId(
      args[0] as string, args[1] as string, args[2] as string,
      isoParaGuardar({ tsKind: 'instant' }, INSTANTE), 'other', 'hola',
    )
    const idPared = chatMessageId(
      args[0] as string, args[1] as string, args[2] as string,
      isoParaGuardar({ tsKind: 'wall' }, PARED), 'other', 'hola',
    )
    expect(idTeams).toBe(idPared)
  })

  it('sin el arreglo, esos dos ids serían DISTINTOS (regresión que se evita)', () => {
    const idCrudo = chatMessageId('u1', 'p1', 'teams', INSTANTE, 'other', 'hola')
    const idPared = chatMessageId('u1', 'p1', 'teams', PARED, 'other', 'hola')
    expect(idCrudo).not.toBe(idPared)
  })

  it('ts nulo o basura no rompe', () => {
    expect(isoParaGuardar({ tsKind: 'instant' }, null)).toBeNull()
    expect(isoParaGuardar({ tsKind: 'instant' }, 'no-es-fecha')).toBeNull()
    expect(isoParaGuardar({ tsKind: 'wall' }, null)).toBeNull()
  })
})
