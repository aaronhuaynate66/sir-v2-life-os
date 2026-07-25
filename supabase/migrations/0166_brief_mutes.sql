-- 0166 — brief_mutes: señales del brief que Aaron mandó a callar (botón 🔕).
--
-- Fricción real (2026-07-25): «eso de problema con tu mama no resuelto es como
-- que pt ya sabemos que mi mama esta empinchada por el tema del mundial, que me
-- lo recuerdes todos los dias no me ayuda en nada». El brief se recalcula desde
-- cero cada mañana: mientras la condición siga siendo verdad, la repite para
-- siempre. No tiene memoria de lo que ya dijo.
--
-- `topic_key` es un hash ESTABLE del tema (tokens significativos ordenados, ver
-- lib/push/morning topicKey), no del texto exacto: así el mute sobrevive a que
-- el builder reformule ("hace 3 semanas" → "hace 4 semanas") y no hay que
-- silenciar lo mismo cada semana.
--
-- user_id TEXT (mismo patrón que chat_feedback): el cron y el webhook escriben
-- bajo service-role pasando el owner id.

create table if not exists public.brief_mutes (
  user_id      text not null,
  topic_key    text not null,
  sample_text  text,                        -- el texto que se calló (para poder mostrarlo/deshacer)
  section      text,                        -- hoy | gente | metas
  muted_at     timestamptz not null default now(),
  primary key (user_id, topic_key)
);

create index if not exists idx_brief_mutes_user
  on public.brief_mutes(user_id, muted_at desc);

-- Log de lo que el brief YA mostró. Dos usos:
--   1. Resolver el tap de 🔕: el callback_data de Telegram entra en 64 bytes y el
--      topic_key no siempre cabe, así que el botón viaja con una `ref` corta que
--      se resuelve acá.
--   2. Base de la supresión automática (una señal repetida N mañanas sin cambio
--      deja de aparecer sola) — el "no tiene memoria de lo que ya dijo".
create table if not exists public.brief_sent_signals (
  user_id      text not null,
  ref          text not null,               -- hash corto del tema (ver muteRef)
  topic_key    text not null,
  sample_text  text not null,
  section      text,
  slot         text,
  sent_at      timestamptz not null default now(),
  primary key (user_id, ref)
);

create index if not exists idx_brief_sent_user_sent
  on public.brief_sent_signals(user_id, sent_at desc);

alter table public.brief_sent_signals enable row level security;

drop policy if exists "select own brief_sent_signals" on public.brief_sent_signals;
create policy "select own brief_sent_signals" on public.brief_sent_signals for select
  using (auth.uid()::text = user_id);

alter table public.brief_mutes enable row level security;

drop policy if exists "select own brief_mutes" on public.brief_mutes;
create policy "select own brief_mutes" on public.brief_mutes for select
  using (auth.uid()::text = user_id);
drop policy if exists "insert own brief_mutes" on public.brief_mutes;
create policy "insert own brief_mutes" on public.brief_mutes for insert
  with check (auth.uid()::text = user_id);
drop policy if exists "delete own brief_mutes" on public.brief_mutes;
create policy "delete own brief_mutes" on public.brief_mutes for delete
  using (auth.uid()::text = user_id);
