import { describe, it, expect } from 'vitest'
import {
  diagnoseChannel, channelSilenceLine, HEARTBEAT_DEAD_HOURS, DATA_QUIET_DAYS,
  type ChannelState,
} from './channelSilence'

const NOW = new Date('2026-07-29T12:00:00Z')
const haceHoras = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
const haceDias = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
const ch = (o: Partial<ChannelState> & { channel: string }): ChannelState => ({
  lastHeartbeatAt: haceHoras(0.2), lastDataAt: haceHoras(1), ...o,
})

describe('diagnoseChannel', () => {
  it('vivo y trayendo → ok', () => {
    expect(diagnoseChannel(ch({ channel: 'instagram' }), NOW).kind).toBe('ok')
  })

  it('EL CASO REAL: dejó de latir → caído', () => {
    // WhatsApp murió el 22-jul y nadie lo notó hasta el 29.
    const v = diagnoseChannel(ch({ channel: 'whatsapp', lastHeartbeatAt: haceDias(7), lastDataAt: haceDias(7) }), NOW)
    expect(v.kind).toBe('caido')
    expect(v.daysSinceData).toBe(7)
  })

  it('el umbral de caída es exactamente HEARTBEAT_DEAD_HOURS', () => {
    expect(diagnoseChannel(ch({ channel: 'x', lastHeartbeatAt: haceHoras(HEARTBEAT_DEAD_HOURS) }), NOW).kind).toBe('caido')
    expect(diagnoseChannel(ch({ channel: 'x', lastHeartbeatAt: haceHoras(HEARTBEAT_DEAD_HOURS - 1) }), NOW).kind).toBe('ok')
  })

  it('deslogueado se detecta AUNQUE siga latiendo', () => {
    // La extensión corre; es la sesión la que cayó. Si se mirara solo la
    // antigüedad del dato, esto pasaría por "silencio normal".
    const v = diagnoseChannel(ch({ channel: 'whatsapp', status: 'logged_out', lastDataAt: haceHoras(1) }), NOW)
    expect(v.kind).toBe('deslogueado')
  })

  it('vivo pero sin traer nada hace días → sin_datos', () => {
    const v = diagnoseChannel(ch({ channel: 'whatsapp', lastDataAt: haceDias(DATA_QUIET_DAYS) }), NOW)
    expect(v.kind).toBe('sin_datos')
  })

  it('un canal que NUNCA estuvo andando no es una caída', () => {
    // Teams nunca se logueó: avisar de eso sería ruido, no una caída.
    expect(diagnoseChannel({ channel: 'teams', lastHeartbeatAt: null, lastDataAt: null }, NOW).kind).toBe('nunca_visto')
  })

  it('sin latido pero con datos viejos igual es caído', () => {
    // Caso de la extensión previa al latido: no reportaba, solo mandaba datos.
    const v = diagnoseChannel({ channel: 'whatsapp', lastHeartbeatAt: null, lastDataAt: haceDias(3) }, NOW)
    expect(v.kind).toBe('caido')
  })
})

describe('channelSilenceLine', () => {
  const diag = (cs: ChannelState[]) => cs.map((c) => diagnoseChannel(c, NOW))

  it('todo bien → null (no habla al aire)', () => {
    expect(channelSilenceLine(diag([ch({ channel: 'instagram' }), ch({ channel: 'whatsapp' })]), NOW)).toBeNull()
  })

  it('EL AVISO QUE FALTÓ: nombra el canal caído Y el que sí anda', () => {
    // Sin decir qué funciona, "el reader está caído" suena a que todo murió —
    // y esa fue exactamente la confusión del 29-jul.
    const line = channelSilenceLine(diag([
      ch({ channel: 'whatsapp', lastHeartbeatAt: haceDias(7), lastDataAt: haceDias(7) }),
      ch({ channel: 'instagram' }),
    ]), NOW)!
    expect(line).toContain('WhatsApp')
    expect(line).toMatch(/hace 7 día/)
    expect(line).toMatch(/pestaña/)
    expect(line).toContain('Instagram sí está andando')
  })

  it('el deslogueo pide la acción concreta: escanear el QR', () => {
    const line = channelSilenceLine(diag([ch({ channel: 'whatsapp', status: 'logged_out' })]), NOW)!
    expect(line).toMatch(/QR/)
  })

  it('un canal nunca visto NO genera aviso', () => {
    const line = channelSilenceLine(diag([
      { channel: 'teams', lastHeartbeatAt: null, lastDataAt: null },
      ch({ channel: 'instagram' }),
    ]), NOW)
    expect(line).toBeNull()
  })

  it('junta varios problemas en una sola línea', () => {
    const line = channelSilenceLine(diag([
      ch({ channel: 'whatsapp', lastHeartbeatAt: haceDias(3), lastDataAt: haceDias(3) }),
      ch({ channel: 'linkedin', status: 'logged_out' }),
      ch({ channel: 'instagram' }),
    ]), NOW)!
    expect(line).toContain('WhatsApp')
    expect(line).toContain('LinkedIn')
    expect(line.split('📡').length).toBe(2) // una sola línea, un solo icono
  })
})
