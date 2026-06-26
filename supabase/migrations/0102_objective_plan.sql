-- 0102 — Plan de acción del objetivo (genérico). Bajo un objetivo: fechas del
-- evento/viaje (para countdown) + bloqueos/checklist con fecha límite (lo que
-- TIENE que pasar para llegar). El presupuesto vive en goal_costs (0100) y los
-- trackers se enganchan por objectiveId. RLS por usuario.
create table if not exists public.objective_plan (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  goal_id      text not null,
  event_date   date,
  travel_start date,
  travel_end   date,
  location     text,
  notes        text,
  updated_at   timestamptz not null default now(),
  unique (user_id, goal_id)
);
alter table public.objective_plan enable row level security;
drop policy if exists "select own objective_plan" on public.objective_plan;
create policy "select own objective_plan" on public.objective_plan for select using (auth.uid() = user_id);
drop policy if exists "insert own objective_plan" on public.objective_plan;
create policy "insert own objective_plan" on public.objective_plan for insert with check (auth.uid() = user_id);
drop policy if exists "update own objective_plan" on public.objective_plan;
create policy "update own objective_plan" on public.objective_plan for update using (auth.uid() = user_id);

create table if not exists public.objective_blockers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  goal_id     text not null,
  title       text not null,
  due_on      date,
  done        boolean not null default false,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.objective_blockers enable row level security;
create index if not exists objective_blockers_user_goal_idx on public.objective_blockers (user_id, goal_id);
drop policy if exists "select own objective_blockers" on public.objective_blockers;
create policy "select own objective_blockers" on public.objective_blockers for select using (auth.uid() = user_id);
drop policy if exists "insert own objective_blockers" on public.objective_blockers;
create policy "insert own objective_blockers" on public.objective_blockers for insert with check (auth.uid() = user_id);
drop policy if exists "update own objective_blockers" on public.objective_blockers;
create policy "update own objective_blockers" on public.objective_blockers for update using (auth.uid() = user_id);
drop policy if exists "delete own objective_blockers" on public.objective_blockers;
create policy "delete own objective_blockers" on public.objective_blockers for delete using (auth.uid() = user_id);
