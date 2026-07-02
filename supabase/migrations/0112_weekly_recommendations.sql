-- ============================================================
-- SIR V2 — Migration 0112: weekly_recommendations (recomendaciones IA por persona/semana)
-- ============================================================
-- Aaron pidió "que SIR me ayude a mejorar mis relaciones". El panel Estado ya
-- lee el vínculo; esto es el paso accionable: "esta semana con Diana: llamala
-- el martes, tocá el examen antes del viernes, mandale un audio".
--
-- Un row por (user, persona, semana ISO). Idempotente por unique index.
-- Regenerable con force=true. Cada recomendación tiene status para trackear.
-- ============================================================

create table if not exists public.weekly_recommendations (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  person_id     text not null references public.people(id) on delete cascade,
  -- Lunes de la semana (YYYY-MM-DD).
  week_start    date not null,
  -- Array de {id: string, text: string, deadline?: string (YYYY-MM-DD), done?: bool}.
  recommendations  jsonb not null default '[]'::jsonb,
  -- Contexto usado para invalidar si algo importante cambia.
  input_hash    text not null,
  model_used    text default 'claude-sonnet-4-5',
  generated_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists weekly_recommendations_uniq
  on public.weekly_recommendations (user_id, person_id, week_start);

create index if not exists weekly_recommendations_by_person
  on public.weekly_recommendations (user_id, person_id, week_start desc);

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.weekly_recommendations enable row level security;

drop policy if exists "select own weekly_recommendations" on public.weekly_recommendations;
create policy "select own weekly_recommendations"
  on public.weekly_recommendations for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own weekly_recommendations" on public.weekly_recommendations;
create policy "insert own weekly_recommendations"
  on public.weekly_recommendations for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own weekly_recommendations" on public.weekly_recommendations;
create policy "update own weekly_recommendations"
  on public.weekly_recommendations for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own weekly_recommendations" on public.weekly_recommendations;
create policy "delete own weekly_recommendations"
  on public.weekly_recommendations for delete
  using (auth.uid()::text = user_id);
