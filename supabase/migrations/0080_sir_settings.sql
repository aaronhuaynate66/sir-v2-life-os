-- 0080 — Ajustes del chat de SIR (#86 conversacional, PR3).
--
-- Una fila por usuario. Hoy solo guarda el MODELO elegido para el chat
-- (control de costo/calidad: haiku barato / sonnet equilibrado / opus máxima).
-- NO guarda API keys de terceros: eso es un follow-up que requiere decidir
-- almacenamiento seguro (env o columna cifrada). Aditiva, RLS por user_id.

create table if not exists public.sir_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  chat_model  text not null default 'sonnet',
  updated_at  timestamptz not null default now()
);

alter table public.sir_settings enable row level security;

drop policy if exists "select own sir_settings" on public.sir_settings;
create policy "select own sir_settings" on public.sir_settings
  for select using (auth.uid() = user_id);
drop policy if exists "insert own sir_settings" on public.sir_settings;
create policy "insert own sir_settings" on public.sir_settings
  for insert with check (auth.uid() = user_id);
drop policy if exists "update own sir_settings" on public.sir_settings;
create policy "update own sir_settings" on public.sir_settings
  for update using (auth.uid() = user_id);
