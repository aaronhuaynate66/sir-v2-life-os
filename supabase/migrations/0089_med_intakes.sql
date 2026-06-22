-- 0089 — Registro de tomas de medicación (caso migraña de Aaron).
--
-- POR QUÉ: Aaron quiere registrar con un toque cada vez que toma una pastilla
-- (qué y cuántas), con día+hora, para armar historial y cruzarlo con el resto
-- (FC, sueño, ánimo, día-X) → ver cómo le influye. Una fila por toma.
-- RLS por user_id. Lo aplica el runner.

create table if not exists public.med_intakes (
  id         text primary key default gen_random_uuid()::text,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,            -- nombre del medicamento
  quantity   numeric not null default 1,
  note       text,
  taken_at   timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_med_intakes_user_taken on public.med_intakes (user_id, taken_at desc);

alter table public.med_intakes enable row level security;
drop policy if exists "select own med_intakes" on public.med_intakes;
create policy "select own med_intakes" on public.med_intakes for select using (auth.uid() = user_id);
drop policy if exists "insert own med_intakes" on public.med_intakes;
create policy "insert own med_intakes" on public.med_intakes for insert with check (auth.uid() = user_id);
drop policy if exists "delete own med_intakes" on public.med_intakes;
create policy "delete own med_intakes" on public.med_intakes for delete using (auth.uid() = user_id);
