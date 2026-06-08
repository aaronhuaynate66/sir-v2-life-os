-- ============================================================
-- SIR V2 — Migration 0066: person_score_snapshots
-- ============================================================
-- Historial diario del SCORE RELACIONAL por persona. Hoy el score
-- (src/lib/people/relationalScore.ts) se computa puro/determinístico pero NO se
-- persiste, así que no hay forma de calcular TENDENCIA (delta). Esta tabla
-- guarda un snapshot por (user, persona, día) para alimentar el delta del
-- Alignment Engine (Etapa 4) y el indicador de tendencia en la ficha.
--
-- Clave de idempotencia: (user_id, person_id, date_bucket) — un snapshot por día.
--
-- FAIL-OPEN: el endpoint /api/person-score/snapshot tolera que esta tabla no
-- exista todavía (best-effort, no rompe la ficha). Seguro deployar código antes.
--
-- NO aplicar a mano: el runner (CI `supabase db push`) ya está activo.
-- ============================================================

create table if not exists public.person_score_snapshots (
  id                    text primary key default gen_random_uuid()::text,
  user_id               text not null,
  person_id             text not null references public.people(id) on delete cascade,
  date_bucket           date not null default current_date,
  global                int  not null,
  fuerza                int  not null,
  reciprocidad          int,
  confianza             int  not null,
  days_since_last_chat  int,
  created_at            timestamptz not null default now()
);

create unique index if not exists uq_person_score_snapshots_user_person_day
  on public.person_score_snapshots(user_id, person_id, date_bucket);

create index if not exists ix_person_score_snapshots_person_date
  on public.person_score_snapshots(user_id, person_id, date_bucket desc);

alter table public.person_score_snapshots enable row level security;

drop policy if exists "select own person_score_snapshots" on public.person_score_snapshots;
create policy "select own person_score_snapshots"
  on public.person_score_snapshots for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own person_score_snapshots" on public.person_score_snapshots;
create policy "insert own person_score_snapshots"
  on public.person_score_snapshots for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own person_score_snapshots" on public.person_score_snapshots;
create policy "update own person_score_snapshots"
  on public.person_score_snapshots for update
  using (auth.uid()::text = user_id);

drop policy if exists "delete own person_score_snapshots" on public.person_score_snapshots;
create policy "delete own person_score_snapshots"
  on public.person_score_snapshots for delete
  using (auth.uid()::text = user_id);
