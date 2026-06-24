-- 0100 — Costos de un objetivo. Lo que cuesta LLEGAR: material (pasaje,
-- entrenamientos, inscripción) con monto, y esfuerzo. Sumado, es el "trofeo de
-- lo invertido" — al lograrlo, "esto fue lo que me costó". El costo RELACIONAL
-- (vínculos tensados) sale del episodio, no se guarda acá. RLS por usuario.
create table if not exists public.goal_costs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  goal_id     text not null,
  label       text not null,
  amount      numeric,
  currency    text not null default 'PEN',
  kind        text not null default 'material',  -- 'material' | 'esfuerzo'
  created_at  timestamptz not null default now()
);
alter table public.goal_costs enable row level security;
create index if not exists goal_costs_user_goal_idx on public.goal_costs (user_id, goal_id);
drop policy if exists "select own goal_costs" on public.goal_costs;
create policy "select own goal_costs" on public.goal_costs for select using (auth.uid() = user_id);
drop policy if exists "insert own goal_costs" on public.goal_costs;
create policy "insert own goal_costs" on public.goal_costs for insert with check (auth.uid() = user_id);
drop policy if exists "delete own goal_costs" on public.goal_costs;
create policy "delete own goal_costs" on public.goal_costs for delete using (auth.uid() = user_id);
