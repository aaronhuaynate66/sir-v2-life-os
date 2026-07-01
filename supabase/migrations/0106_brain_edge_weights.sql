-- 0106 — Cerebro F1 (sustrato del grafo tipado). Deltas de peso APRENDIDOS.
--
-- La lib `src/lib/brain` proyecta las tablas existentes (people, goals,
-- person_links, deals, objective_steps, relationship_moments, moment_participants,
-- goal_costs, person_money, memories, observations, trackers) a aristas tipadas
-- con peso base derivado — determinístico, sin persistencia.
--
-- Esta tabla NO reemplaza a las tablas de aristas ya persistidas (person_links,
-- moment_participants, etc.). SOLO guarda el DELTA aprendido por confirmación /
-- descarte del usuario (F3 Hebbian) que se suma al peso base al ejecutar la
-- proyección. `edge_key` es determinístico y opaco: `srcType:srcId:dstType:dstId:kind`
-- — la misma llave que devuelve `edgeKey(...)` en `src/lib/brain/types.ts`.
--
-- F1 solo lee esta tabla; F3 la escribirá cuando se implemente el bucle
-- Hebbian. Aditiva, RLS por usuario.

create table if not exists public.edge_weights (
  user_id     uuid not null references auth.users(id) on delete cascade,
  edge_key    text not null,
  weight      numeric not null default 0,   -- delta aprendido (positivo o negativo)
  updated_at  timestamptz not null default now(),
  primary key (user_id, edge_key)
);

create index if not exists edge_weights_user_idx on public.edge_weights (user_id);

alter table public.edge_weights enable row level security;

drop policy if exists "select own edge_weights" on public.edge_weights;
create policy "select own edge_weights" on public.edge_weights
  for select using (auth.uid() = user_id);

drop policy if exists "insert own edge_weights" on public.edge_weights;
create policy "insert own edge_weights" on public.edge_weights
  for insert with check (auth.uid() = user_id);

drop policy if exists "update own edge_weights" on public.edge_weights;
create policy "update own edge_weights" on public.edge_weights
  for update using (auth.uid() = user_id);

drop policy if exists "delete own edge_weights" on public.edge_weights;
create policy "delete own edge_weights" on public.edge_weights
  for delete using (auth.uid() = user_id);

-- ─── Verificación (pegar en SQL Editor) ────────────────────────────
-- select policyname from pg_policies where tablename = 'edge_weights';
-- select * from public.edge_weights order by updated_at desc limit 10;
