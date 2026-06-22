-- 0090 — "Mis medicamentos": registro de los medicamentos que Aaron toma, para
-- que aparezcan como botones de un toque en /medicacion sin tener que haberlos
-- tomado antes (separado de med_intakes, que es el historial de tomas). RLS.
create table if not exists public.med_registry (
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  dose       text,
  created_at timestamptz not null default now(),
  primary key (user_id, name)
);
alter table public.med_registry enable row level security;
drop policy if exists "select own med_registry" on public.med_registry;
create policy "select own med_registry" on public.med_registry for select using (auth.uid() = user_id);
drop policy if exists "insert own med_registry" on public.med_registry;
create policy "insert own med_registry" on public.med_registry for insert with check (auth.uid() = user_id);
drop policy if exists "delete own med_registry" on public.med_registry;
create policy "delete own med_registry" on public.med_registry for delete using (auth.uid() = user_id);
