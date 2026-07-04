-- SIR V2 — Perfiles Big Five (19·M4 + 19·M5): instrumento consentido de autoreporte.
--
-- Una sola tabla sirve a los dos módulos: subject='self' (autoperfil de Aaron,
-- 19·M5) o subject=<person_id> (test que respondió esa persona, consentido, 19·M4).
-- Rasgos OCEAN en 0-100. Dedupe por (user_id, subject): rehacer el test ACTUALIZA.

create table if not exists public.big_five_profiles (
  id        text primary key default gen_random_uuid()::text,
  user_id   uuid not null references auth.users(id) on delete cascade,
  subject   text not null,            -- 'self' | <person_id>
  o         int, c int, e int, a int, n int,   -- 0-100 por rasgo
  taken_at  timestamptz not null default now(),
  unique (user_id, subject)
);

alter table public.big_five_profiles enable row level security;
create policy "select own big_five" on public.big_five_profiles for select using (auth.uid() = user_id);
create policy "insert own big_five" on public.big_five_profiles for insert with check (auth.uid() = user_id);
create policy "update own big_five" on public.big_five_profiles for update using (auth.uid() = user_id);
create policy "delete own big_five" on public.big_five_profiles for delete using (auth.uid() = user_id);
