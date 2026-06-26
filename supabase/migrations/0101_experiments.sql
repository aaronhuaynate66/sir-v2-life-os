-- 0101 — Loop de Experimentos (Motor #2). UN experimento conductual por semana
-- (activación conductual): SIR propone desde el Espejo, Aaron lo corre, registra
-- el resultado y ajusta. Cierra el bucle que el archivador nunca corría.
-- RLS por usuario; append + update de estado/resultado.
create table if not exists public.experiments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  detail      text,
  source      text not null default 'manual',   -- 'espejo' | 'manual'
  status      text not null default 'activo',    -- 'activo' | 'hecho' | 'descartado'
  week_start  date,                              -- lunes (Lima) de la semana
  result      text,                              -- qué pasó (al cerrarlo)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.experiments enable row level security;
create index if not exists experiments_user_time_idx on public.experiments (user_id, created_at desc);

drop policy if exists "select own experiments" on public.experiments;
create policy "select own experiments" on public.experiments for select using (auth.uid() = user_id);
drop policy if exists "insert own experiments" on public.experiments;
create policy "insert own experiments" on public.experiments for insert with check (auth.uid() = user_id);
drop policy if exists "update own experiments" on public.experiments;
create policy "update own experiments" on public.experiments for update using (auth.uid() = user_id);
drop policy if exists "delete own experiments" on public.experiments;
create policy "delete own experiments" on public.experiments for delete using (auth.uid() = user_id);
