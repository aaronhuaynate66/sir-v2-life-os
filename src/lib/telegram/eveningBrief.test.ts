import { describe, it, expect } from 'vitest'
import { EVENING_BRIEF_MARK, formatEveningBriefForChat } from './eveningBrief'

describe('formatEveningBriefForChat', () => {
  // ═══ EL AMARRE DE LA HUELLA ═══════════════════════════════════════════════
  //
  // `lib/cron/evidencia` busca en `sir_messages` los mensajes que empiezan con
  // EVENING_BRIEF_MARK para saber si `evening-push` corrió esa noche. Si alguien
  // cambia el saludo y la marca queda huérfana, el vigilante grita que el canal
  // nocturno nunca corrió sobre un canal sano — y una falsa alarma ahí destruye
  // la confianza en el vigilante (ver `lib/cron/salud`).
  it('empieza con EVENING_BRIEF_MARK — es la huella que lee el vigilante de crons', () => {
    expect(formatEveningBriefForChat().startsWith(EVENING_BRIEF_MARK)).toBe(true)
    expect(formatEveningBriefForChat('Te faltan 2: meditar, leer').startsWith(EVENING_BRIEF_MARK)).toBe(true)
  })

  it('la marca no es vacía: un LIKE con eso matchearía cualquier mensaje', () => {
    expect(EVENING_BRIEF_MARK.trim().length).toBeGreaterThan(0)
  })

  it('invita a reflexionar y a dictar notas', () => {
    const s = formatEveningBriefForChat()
    expect(s).toMatch(/cómo estuvo tu día/i)
    expect(s).toMatch(/dictámelo|anoto/i)
  })
  it('incluye la línea de hábitos pendientes si viene', () => {
    const s = formatEveningBriefForChat('Te faltan hoy: meditar, leer')
    expect(s).toContain('Te faltan hoy: meditar, leer')
  })
  it('no usa markdown', () => {
    expect(formatEveningBriefForChat('x')).not.toMatch(/[*_#]/)
  })
})
