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
    // Se aísla la variable del LATIDO poniendo la data también vieja: con data
    // fresca el veredicto correcto es 'sin_latido', no 'caido' (ver más abajo).
    const viejo = { lastDataAt: haceDias(5) }
    expect(diagnoseChannel(ch({ channel: 'x', ...viejo, lastHeartbeatAt: haceHoras(HEARTBEAT_DEAD_HOURS) }), NOW).kind).toBe('caido')
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

  it('SIN LATIDO PERO CON DATOS: dice "versión vieja", no "está caído"', () => {
    // El estado REAL del 30-jul-2026: `reader_heartbeats` en 0 filas mientras
    // Instagram había traído data a las 11:42 de ese mismo día.
    const line = channelSilenceLine(diag([
      { channel: 'instagram', lastHeartbeatAt: null, lastDataAt: haceHoras(1) },
    ]), NOW)!
    expect(line).toContain('Instagram')
    expect(line).toMatch(/trae datos/)
    expect(line).toMatch(/versión vieja/)
    expect(line).toMatch(/recargarla/)
    // Y sobre todo: NO le dice a Aaron una falsedad.
    expect(line).not.toMatch(/dejó de reportar/)
    expect(line).not.toMatch(/pestaña está cerrada/)
  })

  it('el escenario COMPLETO de hoy: IG sin latido pero vivo, WA muerto', () => {
    // Los dos canales de la otra PC, tal como estaban: la extensión vieja no late,
    // Instagram igual trae data, y WhatsApp lleva días sin traer nada. El aviso
    // tiene que distinguirlos — meterlos en la misma bolsa fue el bug original.
    const line = channelSilenceLine(diag([
      { channel: 'instagram', lastHeartbeatAt: null, lastDataAt: haceHoras(1) },
      { channel: 'whatsapp', lastHeartbeatAt: null, lastDataAt: haceDias(5) },
    ]), NOW)!
    expect(line).toMatch(/WhatsApp dejó de reportar/)
    expect(line).toMatch(/hace 5 día/)
    expect(line).toMatch(/Instagram trae datos pero no reporta latido/)
  })

  it('enumera bien: "A, B y C", no "A y B y C"', () => {
    // Salió así de verdad al correrlo contra la base: "Instagram y LinkedIn y
    // Outlook sí están andando".
    const line = channelSilenceLine(diag([
      ch({ channel: 'whatsapp', lastDataAt: haceDias(DATA_QUIET_DAYS) }),
      ch({ channel: 'instagram' }), ch({ channel: 'linkedin' }), ch({ channel: 'outlook' }),
    ]), NOW)!
    expect(line).toContain('Instagram, LinkedIn y Outlook')
    expect(line).not.toContain(' y LinkedIn y ')
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
