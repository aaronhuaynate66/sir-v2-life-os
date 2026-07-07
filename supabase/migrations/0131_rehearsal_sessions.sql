-- SIR V2 — Histórico de la Sala de Ensayo.
--
-- Cada vez que Aaron ensaya un escenario con una persona, se guarda: el objetivo,
-- el resultado completo (lectura + escenarios + objeciones + acciones), y una
-- huella del contexto que se usó (qué señales había: ciclo, pulso, estado). Así
-- puede volver a un ensayo, comparar contra el pasado, y ver cómo evolucionan sus
-- escenarios. Solo lectura/inserción por el dueño (RLS). No alimenta IA/embeddings.

create table if not exists public.rehearsal_sessions (
  id           text primary key default gen_random_uuid()::text,
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    text references public.people(id) on delete set null,
  person_name  text,                       -- snapshot del nombre (por si se borra la persona)
  objective    text not null,
  result       jsonb not null,             -- RehearseResult completo
  context_used jsonb not null default '{}'::jsonb, -- flags: {cycle, pulse, selfState, memories, conversation}
  created_at   timestamptz not null default now()
);

create index if not exists rehearsal_sessions_user_idx on public.rehearsal_sessions (user_id, created_at desc);
create index if not exists rehearsal_sessions_person_idx on public.rehearsal_sessions (person_id, created_at desc);

alter table public.rehearsal_sessions enable row level security;
create policy "select own rehearsals" on public.rehearsal_sessions for select using (auth.uid() = user_id);
create policy "insert own rehearsals" on public.rehearsal_sessions for insert with check (auth.uid() = user_id);
create policy "delete own rehearsals" on public.rehearsal_sessions for delete using (auth.uid() = user_id);
