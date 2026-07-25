-- 0168 — El brief deja de repetir SOLO lo que ya dijo (sin que Aaron toque 🔕).
--
-- Fricción original (2026-07-25): «eso de problema con tu mamá no resuelto…
-- que me lo recuerdes todos los días no me ayuda en nada». El 🔕 de 0166 lo
-- resuelve a mano; esto lo resuelve solo: una señal que apareció 3 mañanas
-- SEGUIDAS sin cambiar se duerme, y vuelve recién a las 2 semanas (si para
-- entonces sigue vigente). Ni la repite a diario, ni la olvida para siempre.
--
-- Se apoya en `brief_sent_signals` (0166), que ya registraba lo mostrado pero
-- pisaba `sent_at` en cada upsert → no había forma de saber cuántas mañanas
-- seguidas venía apareciendo.

alter table public.brief_sent_signals
  add column if not exists streak_days integer not null default 1;

-- Día de Lima (YYYY-MM-DD) de la última vez que se MOSTRÓ. Comparar días, no
-- timestamps: el brief sale ~6:45am Lima y el UTC cruzaría de fecha.
alter table public.brief_sent_signals
  add column if not exists last_sent_day text;

-- Día en que se durmió sola. null = despierta.
alter table public.brief_sent_signals
  add column if not exists auto_snoozed_at text;

create index if not exists idx_brief_sent_snoozed
  on public.brief_sent_signals(user_id, auto_snoozed_at)
  where auto_snoozed_at is not null;
