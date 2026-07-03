-- ============================================================
-- SIR V2 — Migration 0117: review_cards (Spaced Repetition — Anki-style)
-- ============================================================
-- Ayudás a Aaron a memorizar detalles importantes de su gente cercana
-- (cumples, gustos, temas sensibles, dónde estudiaron, etc.) con
-- intervalos crecientes. Algoritmo tipo SM-2 simplificado.
--
-- Fuentes de cards (source_kind):
--   'birthday'      → "¿Cuándo cumple X?" ← people.special_dates
--   'memory'        → "¿Qué recordás de X sobre <tema>?" ← memories importance≥7
--   'identity'      → "¿Qué rol tiene X en HNG?" ← identity_profile roles
--   'manual'        → creada por Aaron manualmente
--
-- Card lifecycle:
--   nueva → primer review: interval=1d, ease=2.5
--   grade 0 (no sabía) → interval=1d, ease-= 0.2 (min 1.3)
--   grade 1 (dificultad) → interval*ease*0.5, ease-= 0.1
--   grade 2 (bien) → interval*ease
--   grade 3 (fácil) → interval*ease*1.3, ease+= 0.1
-- ============================================================

create table if not exists public.review_cards (
  id              text primary key default gen_random_uuid()::text,
  user_id         text not null,
  question        text not null,
  answer          text not null,
  -- Fuente para deep-link y desduplicación al regenerar.
  source_kind     text not null check (source_kind in ('birthday', 'memory', 'identity', 'manual')),
  source_ref      text, -- id de la persona/memoria/etc según kind
  -- Estado SR.
  ease_factor     numeric not null default 2.5,
  interval_days   int not null default 0,
  next_review_at  timestamptz not null default now(),
  reviews_count   int not null default 0,
  streak          int not null default 0,
  last_grade      smallint,
  last_reviewed_at timestamptz,
  suspended_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Unique: no duplicar cards del mismo (user, kind, source_ref).
create unique index if not exists review_cards_source_uniq
  on public.review_cards (user_id, source_kind, source_ref)
  where source_ref is not null;

-- Índice de "cards debidas" para el fetch principal.
create index if not exists review_cards_due
  on public.review_cards (user_id, next_review_at)
  where suspended_at is null;

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.review_cards enable row level security;

drop policy if exists "select own review_cards" on public.review_cards;
create policy "select own review_cards"
  on public.review_cards for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own review_cards" on public.review_cards;
create policy "insert own review_cards"
  on public.review_cards for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own review_cards" on public.review_cards;
create policy "update own review_cards"
  on public.review_cards for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own review_cards" on public.review_cards;
create policy "delete own review_cards"
  on public.review_cards for delete
  using (auth.uid()::text = user_id);
