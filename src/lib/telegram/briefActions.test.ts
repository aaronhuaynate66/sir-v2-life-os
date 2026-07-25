import { describe, it, expect } from 'vitest'
import { runBriefAction, todaySixPmLimaISO } from './briefActions'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Stub mínimo de supabase: devuelve lo que se le configure por tabla. */
function fakeDb(behavior: Record<string, { row?: unknown; error?: unknown }>) {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = []
  const client = {
    from(table: string) {
      const cfg = behavior[table] ?? {}
      const result = { data: cfg.row ?? null, error: cfg.error ?? null }
      const chain: Record<string, unknown> = {
        select: () => chain, eq: () => chain, maybeSingle: async () => result,
        update(payload: unknown) { calls.push({ table, op: 'update', payload }); return chain },
        insert: async (payload: unknown) => { calls.push({ table, op: 'insert', payload }); return result },
        upsert: async (payload: unknown) => { calls.push({ table, op: 'upsert', payload }); return result },
      }
      return chain
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

const NOW = new Date('2026-07-25T14:00:00Z')

describe('todaySixPmLimaISO', () => {
  it('las 6pm de Lima son las 23:00 UTC del mismo día', () => {
    expect(todaySixPmLimaISO(NOW)).toBe('2026-07-25T23:00:00.000Z')
  })
  it('de madrugada UTC sigue siendo el día de Lima, no el siguiente', () => {
    // 02:00 UTC del 26 = 21:00 del 25 en Lima.
    expect(todaySixPmLimaISO(new Date('2026-07-26T02:00:00Z'))).toBe('2026-07-25T23:00:00.000Z')
  })
})

describe('runBriefAction', () => {
  it('✅ Ya lo hice marca la tarea y confirma con su título', async () => {
    const { client, calls } = fakeDb({ objective_steps: { row: { title: 'UAT con Dayana' } } })
    const res = await runBriefAction(client, 'u1', 'task_done', 'step_1', { now: NOW })
    expect(res.toast).toContain('UAT con Dayana')
    expect(calls[0]).toMatchObject({ table: 'objective_steps', op: 'update', payload: { status: 'hecho' } })
  })

  it('⏰ agenda el recordatorio para hoy 6pm con el texto de la tarea', async () => {
    const { client, calls } = fakeDb({ objective_steps: { row: { title: 'UAT con Dayana' } } })
    const res = await runBriefAction(client, 'u1', 'task_remind', 'step_1', { now: NOW })
    expect(res.toast).toContain('6pm')
    expect(calls.find((c) => c.table === 'reminders')?.payload).toMatchObject({
      text: 'UAT con Dayana', due_at: '2026-07-25T23:00:00.000Z',
    })
  })

  it('✅ Dar por cerrado cierra el momento', async () => {
    const { client, calls } = fakeDb({ relationship_moments: { row: { title: 'Conflicto Mundial' } } })
    const res = await runBriefAction(client, 'u1', 'moment_close', 'mom_1', { now: NOW })
    expect(res.toast).toContain('Conflicto Mundial')
    expect(calls[0]).toMatchObject({ op: 'update', payload: { status: 'cerrado' } })
  })

  it('🔕 resuelve la ref contra lo enviado y guarda el topic_key estable', async () => {
    const { client, calls } = fakeDb({
      brief_sent_signals: { row: { topic_key: 'bomberos-conflicto-mundial', sample_text: 'texto', section: 'gente' } },
    })
    const res = await runBriefAction(client, 'u1', 'mute', 'abc', { now: NOW })
    expect(res.toast).toContain('no te lo repito')
    expect(calls.find((c) => c.table === 'brief_mutes')?.payload).toMatchObject({
      user_id: 'u1', topic_key: 'bomberos-conflicto-mundial',
    })
  })

  it('🔕 sin registro de esa señal no inventa nada', async () => {
    const { client, calls } = fakeDb({ brief_sent_signals: { row: null } })
    const res = await runBriefAction(client, 'u1', 'mute', 'abc', { now: NOW })
    expect(res.toast).toContain('Ya no tengo')
    expect(calls.find((c) => c.table === 'brief_mutes')).toBeUndefined()
  })

  it('✍️ pide el borrador nombrando a la persona y lo devuelve como respuesta', async () => {
    const { client } = fakeDb({ people: { row: { name: 'Maria Isabel Espinoza' } } })
    let asked = ''
    const res = await runBriefAction(client, 'u1', 'person_draft', 'per_1', {
      now: NOW, askSirText: async (q) => { asked = q; return 'Hola ma, ¿cómo estás?' },
    })
    expect(asked).toContain('Maria Isabel Espinoza')
    expect(res.reply).toBe('Hola ma, ¿cómo estás?')
  })

  it('🚀 pide el próximo paso del objetivo por su título', async () => {
    const { client } = fakeDb({ goals: { row: { title: 'Cerrar Boticas Jhodaal' } } })
    let asked = ''
    const res = await runBriefAction(client, 'u1', 'goal_next', 'g_1', {
      now: NOW, askSirText: async (q) => { asked = q; return 'Llama a la administradora el lunes.' },
    })
    expect(asked).toContain('Cerrar Boticas Jhodaal')
    expect(res.reply).toContain('lunes')
  })

  it('sin cerebro disponible, las acciones que piensan avisan en vez de romper', async () => {
    const { client } = fakeDb({ people: { row: { name: 'Maria' } } })
    const res = await runBriefAction(client, 'u1', 'person_draft', 'per_1', { now: NOW })
    expect(res.reply).toBeUndefined()
    expect(res.toast).toContain('No puedo')
  })

  it('un error de base no rompe: devuelve mensaje honesto', async () => {
    const { client } = fakeDb({ objective_steps: { row: null, error: { message: 'boom' } } })
    const res = await runBriefAction(client, 'u1', 'task_done', 'step_1', { now: NOW })
    expect(res.toast).toContain('No pude')
  })
})
