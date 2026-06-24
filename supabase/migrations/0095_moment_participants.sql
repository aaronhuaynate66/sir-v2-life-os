-- 0095 — Episodios multi-persona. Hasta acá un "momento" (relationship_moments)
-- pertenecía a UNA persona. Un conflicto/episodio real involucra a varias
-- (ej. la pelea del Mundial: mamá + hermana). En vez de partirlo en hechos
-- sueltos por ficha, el momento sigue teniendo su persona PRIMARIA (person_id)
-- y esta tabla suma a los demás participantes. Participantes = primaria ∪ filas
-- aquí. Cascade al borrar el momento. RLS por usuario.
create table if not exists public.moment_participants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  moment_id  uuid not null references public.relationship_moments(id) on delete cascade,
  person_id  uuid not null,
  created_at timestamptz not null default now(),
  unique (moment_id, person_id)
);
alter table public.moment_participants enable row level security;
create index if not exists moment_participants_user_person_idx
  on public.moment_participants (user_id, person_id);
create index if not exists moment_participants_moment_idx
  on public.moment_participants (moment_id);

drop policy if exists "select own moment_participants" on public.moment_participants;
create policy "select own moment_participants" on public.moment_participants for select using (auth.uid() = user_id);
drop policy if exists "insert own moment_participants" on public.moment_participants;
create policy "insert own moment_participants" on public.moment_participants for insert with check (auth.uid() = user_id);
drop policy if exists "delete own moment_participants" on public.moment_participants;
create policy "delete own moment_participants" on public.moment_participants for delete using (auth.uid() = user_id);
