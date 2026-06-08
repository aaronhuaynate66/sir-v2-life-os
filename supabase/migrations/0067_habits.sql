-- ============================================================
-- SIR V2 — Migration 0067: habits + habit_checkins (Etapa 3 — comportamiento)
-- ============================================================
-- HÁBITO = comportamiento recurrente con racha/consistencia (distinto de
-- `trackers`, que son métricas con umbral, y de `person_logs`, que es estado
-- diario por persona). Primitiva nueva de la capa de comportamiento.
--
--   habits         — definición (título, cadencia, meta por período).
--   habit_checkins — un registro por (hábito, día) = "lo cumplí ese día".
--
-- Racha y consistencia se computan en el cliente (src/lib/habits/streak.ts,
-- puro) a partir de los checkins; no se materializan acá.
--
-- ADITIVA + idempotente. NO aplicar a mano: el runner (CI) ya está activo.
-- ============================================================

create table if not exists public.habits (
  id                text primary key default gen_random_uuid()::text,
  user_id           text not null,
  title             text not null,
  cadence           text not null default 'daily' check (cadence in ('daily', 'weekly')),
  target_per_period int  not null default 1 check (target_per_period between 1 and 7),
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  archived_at       timestamptz
);
create index if not exists ix_habits_user on public.habits(user_id, active);

create table if not exists public.habit_checkins (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null,
  habit_id    text not null references public.habits(id) on delete cascade,
  date        date not null default current_date,
  created_at  timestamptz not null default now()
);
create unique index if not exists uq_habit_checkins_habit_day on public.habit_checkins(user_id, habit_id, date);
create index if not exists ix_habit_checkins_habit on public.habit_checkins(user_id, habit_id, date desc);

alter table public.habits enable row level security;
alter table public.habit_checkins enable row level security;

drop policy if exists "select own habits" on public.habits;
create policy "select own habits" on public.habits for select using (auth.uid()::text = user_id);
drop policy if exists "insert own habits" on public.habits;
create policy "insert own habits" on public.habits for insert with check (auth.uid()::text = user_id);
drop policy if exists "update own habits" on public.habits;
create policy "update own habits" on public.habits for update using (auth.uid()::text = user_id);
drop policy if exists "delete own habits" on public.habits;
create policy "delete own habits" on public.habits for delete using (auth.uid()::text = user_id);

drop policy if exists "select own habit_checkins" on public.habit_checkins;
create policy "select own habit_checkins" on public.habit_checkins for select using (auth.uid()::text = user_id);
drop policy if exists "insert own habit_checkins" on public.habit_checkins;
create policy "insert own habit_checkins" on public.habit_checkins for insert with check (auth.uid()::text = user_id);
drop policy if exists "delete own habit_checkins" on public.habit_checkins;
create policy "delete own habit_checkins" on public.habit_checkins for delete using (auth.uid()::text = user_id);
