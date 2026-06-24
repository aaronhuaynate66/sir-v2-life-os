-- 0098 — Referencias de un EPISODIO en otras conversaciones (Paso 3). El
-- episodio (relationship_moments) no solo vive donde explotó: se MENCIONA en
-- otros chats (le contás del Mundial a un amigo, a tu papá…). Esta tabla guarda
-- esas menciones CONFIRMADAS por el usuario (SIR propone barriendo el archivo,
-- el usuario confirma — nunca auto-link). Es el ALCANCE/hilo del episodio, NO
-- participantes del conflicto. RLS por usuario.
create table if not exists public.moment_references (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  moment_id   uuid not null references public.relationship_moments(id) on delete cascade,
  person_id   text not null,
  snippet     text,
  ref_date    text,
  created_at  timestamptz not null default now()
);
alter table public.moment_references enable row level security;
create index if not exists moment_references_moment_idx on public.moment_references (moment_id);
create index if not exists moment_references_user_idx on public.moment_references (user_id, moment_id);

drop policy if exists "select own moment_references" on public.moment_references;
create policy "select own moment_references" on public.moment_references for select using (auth.uid() = user_id);
drop policy if exists "insert own moment_references" on public.moment_references;
create policy "insert own moment_references" on public.moment_references for insert with check (auth.uid() = user_id);
drop policy if exists "delete own moment_references" on public.moment_references;
create policy "delete own moment_references" on public.moment_references for delete using (auth.uid() = user_id);
