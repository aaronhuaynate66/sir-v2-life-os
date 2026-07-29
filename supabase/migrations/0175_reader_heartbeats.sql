-- 0175 — Latido por CANAL del reader: distinguir "no pasó nada" de "está muerto".
--
-- POR QUÉ (fallo real, 22→29 jul 2026). El reader de WhatsApp Web venía trayendo
-- los mensajes de Aaron con latencia de SEGUNDOS. Se cortó el 22-jul y nadie se
-- enteró hasta que él preguntó el 29: "¿por qué mis conversaciones con Diana no
-- están cargadas? si he hablado con ella incluso hoy en la mañana".
--
-- Siete días ciego. Y lo que lo volvió invisible: **Instagram siguió andando todo
-- ese tiempo**, así que el reader parecía vivo desde afuera.
--
-- EL PROBLEMA ERA DE MODELO, no de código: la ausencia de datos es AMBIGUA. Puede
-- significar "nadie le escribió" o "el canal está caído", y las dos se veían igual.
-- Con un latido cada ~10 minutos la diferencia queda explícita:
--   · late y no trae datos  → silencio real, todo bien
--   · dejó de latir         → caído, hay que avisar
--   · late y dice logged_out→ la sesión cayó (QR), la extensión sigue corriendo
--
-- UNA FILA POR (usuario, canal): es un estado presente, no un histórico. Lo que
-- importa es "¿está vivo AHORA?", y guardar una fila por latido serían ~150 filas
-- por día por canal para responder siempre la misma pregunta.

create table if not exists public.reader_heartbeats (
  user_id        text not null,
  /** 'whatsapp' | 'instagram' | 'linkedin' | 'teams' | 'outlook'. */
  channel        text not null,

  /** Último latido: la extensión reportó que ese canal está corriendo. */
  last_beat_at   timestamptz not null default now(),
  /** Lo que el propio canal reportó: 'ok' | 'logged_out' | un error corto. */
  status         text not null default 'ok',
  /** Detalle libre para depurar (versión de la extensión, url, conteos). */
  detail         text,

  /** Última vez que ESE canal trajo datos de verdad. Lo actualiza el endpoint de
   *  ingesta, no el latido — es la otra mitad del diagnóstico. */
  last_data_at   timestamptz,

  updated_at     timestamptz not null default now(),
  primary key (user_id, channel)
);

create index if not exists idx_reader_hb_user on public.reader_heartbeats(user_id);

alter table public.reader_heartbeats enable row level security;

drop policy if exists "select own reader_heartbeats" on public.reader_heartbeats;
create policy "select own reader_heartbeats" on public.reader_heartbeats for select
  using (auth.uid()::text = user_id);
