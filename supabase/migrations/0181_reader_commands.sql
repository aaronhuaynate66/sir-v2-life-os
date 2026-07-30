-- 0181 — Comandos para la extensión: el latido pasa a ser de IDA Y VUELTA.
--
-- ═══ QUÉ PIDIÓ AARON ═════════════════════════════════════════════════════════
--
-- 30-jul-2026: *"sigo sin entender por qué no podemos hacer que funcione bien la
-- extensión y lea todas las conversaciones en la otra pc, deberíamos hasta poder
-- manejarla remotamente por la extensión, o de repente crear más extensiones que te
-- den feedback"*.
--
-- ═══ POR QUÉ NO HACE FALTA NI POLLING NI UN ENDPOINT NUEVO ═══════════════════
--
-- La auditoría del canal encontró que **la vía de vuelta ya existe y se tira a la
-- basura**: la extensión postea a `/api/reader/heartbeat` cada 10 minutos con una
-- alarma que sobrevive reinicios del navegador, y `background.js` hace
-- `await fetch(...)` **descartando la respuesta por completo**. O sea: hay un canal
-- servidor→extensión abierto cada 10 min y nadie habla por él.
--
-- Entonces los comandos viajan en la RESPUESTA DEL LATIDO. Ventajas sobre inventar
-- un GET con polling:
--   · Cero permisos nuevos. (`host_permissions` ya incluye el dominio de SIR, pero
--     ni eso hace falta: es la misma request que ya sale.)
--   · Cero timers nuevos. La alarma de 10 min ya existe y ya se re-agenda sola.
--   · Cero requests extra. Es la misma llamada, con la respuesta aprovechada.
--
-- ═══ POR QUÉ UNA TABLA Y NO UN CAMPO ════════════════════════════════════════
--
-- Un comando necesita saberse ENTREGADO y EJECUTADO, no solo escrito: si no, no hay
-- forma de distinguir "la extensión nunca lo recibió" de "lo recibió y falló". Esa
-- ambigüedad es exactamente el bug que costó 4 días de silencio del reader de
-- WhatsApp (ver mig 0180 y `lib/reader/channelSilence.ts`), y no se repite acá.
--
-- Ciclo de vida: `pendiente` → `entregado` (el latido se lo llevó) → `ok` | `error`
-- (la extensión reportó el resultado en el latido siguiente).

create table if not exists public.reader_commands (
  id           text primary key default gen_random_uuid()::text,
  user_id      text not null,
  /** A qué canal va: 'whatsapp' | 'instagram' | 'linkedin' | 'teams' | 'outlook'. */
  channel      text not null,
  /**
   * Qué hacer. Cerrado a propósito — un comando de texto libre ejecutándose en el
   * navegador de Aaron es una superficie que no quiero:
   *   · 'resync'  → rehacer el backfill. `params.dias` y `params.chat` lo acotan.
   *   · 'probe'   → reportar el diagnóstico del lector (si wa-js cargó, cuántos
   *                 chats ve). Es lo que hoy hay que pedirle a mano por consola.
   */
  kind         text not null check (kind in ('resync', 'probe')),
  /** Parámetros del comando: { dias?: int, chat?: text }. */
  params       jsonb not null default '{}'::jsonb,

  status       text not null default 'pendiente'
                 check (status in ('pendiente', 'entregado', 'ok', 'error')),
  /** Cuándo se lo llevó un latido. Distinguir esto de 'ejecutado' es el punto. */
  delivered_at timestamptz,
  /** Cuándo reportó resultado. */
  done_at      timestamptz,
  /** Lo que reportó: conteos si salió bien, el error si no. */
  result       text,

  created_at   timestamptz not null default now()
);

-- Se buscan por (usuario, canal, pendientes) en cada latido → índice parcial.
create index if not exists idx_reader_cmd_pendientes
  on public.reader_commands(user_id, channel, created_at)
  where status = 'pendiente';

alter table public.reader_commands enable row level security;

-- Solo lectura para el dueño (para verlos en la app). La escritura la hace el
-- server con service-role, igual que reader_heartbeats (0175): la extensión se
-- autentica con READER_INGEST_TOKEN, no con una sesión de Supabase.
drop policy if exists "select own reader_commands" on public.reader_commands;
create policy "select own reader_commands" on public.reader_commands for select
  using (auth.uid()::text = user_id);

-- ═══ Y el latido pasa a contar algo ══════════════════════════════════════════
--
-- `reader_heartbeats.detail` se declaró en 0175 para "versión de la extensión, url,
-- conteos" y en la práctica recibía SOLO `'1 pestaña(s)'`. Mientras tanto la
-- extensión guarda `lastError`, `sent` y `lastThread` en `chrome.storage` y **nunca
-- los manda**. Por eso el reader de WhatsApp pudo estar caído del 26-jul al 30-jul
-- con el latido diciendo `ok`: contaba pestañas, no si producía.
--
-- Estas columnas son las que permiten notar una caída el mismo día.
alter table public.reader_heartbeats add column if not exists ext_version text;
alter table public.reader_heartbeats add column if not exists last_error text;
/** Mensajes/items que la extensión dice haber mandado en total (acumulado local). */
alter table public.reader_heartbeats add column if not exists sent_count integer;
/**
 * Diagnóstico crudo del lector, por canal. En WhatsApp: si `window.WPP` cargó, si el
 * Store está listo y cuántos chats ve. Es la señal que distingue "la pestaña está
 * abierta" de "el lector está funcionando" — y esa distinción es justo la que
 * faltaba.
 */
alter table public.reader_heartbeats add column if not exists probe jsonb;

comment on table public.reader_commands is
  'Comandos servidor→extensión. Viajan en la RESPUESTA del latido (que antes se descartaba): sin polling ni permisos nuevos. Mig 0181.';
comment on column public.reader_heartbeats.probe is
  'Diagnóstico del lector por canal (ej. WhatsApp: si wa-js cargó y cuántos chats ve). Distingue "pestaña abierta" de "lector funcionando". Mig 0181.';
