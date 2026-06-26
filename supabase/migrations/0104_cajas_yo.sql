-- 0104 — Desarrollo de las 3 cajas del /yo (Espejo / Experimento / Pre-mortem).
-- (1) experiments.worked: ¿te funcionó? — habilita el HISTORIAL de prueba y error.
-- (2) premortems: guardar la decisión + lo que SIR proyectó + qué pasó realmente.
-- (3) espejo_snapshots: estado semanal para ver la TENDENCIA semana a semana.

-- (1) ¿te funcionó? en el experimento cerrado: 'si' | 'no' | 'parcial' | null
alter table public.experiments add column if not exists worked text;

-- (2) Pre-mortems guardados
create table if not exists public.premortems (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  decision    text not null,
  projection  text not null,
  outcome     text,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.premortems enable row level security;
create index if not exists premortems_user_time_idx on public.premortems (user_id, created_at desc);
drop policy if exists "select own premortems" on public.premortems;
create policy "select own premortems" on public.premortems for select using (auth.uid() = user_id);
drop policy if exists "insert own premortems" on public.premortems;
create policy "insert own premortems" on public.premortems for insert with check (auth.uid() = user_id);
drop policy if exists "update own premortems" on public.premortems;
create policy "update own premortems" on public.premortems for update using (auth.uid() = user_id);
drop policy if exists "delete own premortems" on public.premortems;
create policy "delete own premortems" on public.premortems for delete using (auth.uid() = user_id);

-- (3) Snapshot semanal del Espejo (1 por semana por usuario)
create table if not exists public.espejo_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  week_start  date not null,
  state       text not null,
  gaps_count  int not null default 0,
  wins_count  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, week_start)
);
alter table public.espejo_snapshots enable row level security;
create index if not exists espejo_snapshots_user_week_idx on public.espejo_snapshots (user_id, week_start desc);
drop policy if exists "select own espejo_snapshots" on public.espejo_snapshots;
create policy "select own espejo_snapshots" on public.espejo_snapshots for select using (auth.uid() = user_id);
drop policy if exists "insert own espejo_snapshots" on public.espejo_snapshots;
create policy "insert own espejo_snapshots" on public.espejo_snapshots for insert with check (auth.uid() = user_id);
drop policy if exists "update own espejo_snapshots" on public.espejo_snapshots;
create policy "update own espejo_snapshots" on public.espejo_snapshots for update using (auth.uid() = user_id);
