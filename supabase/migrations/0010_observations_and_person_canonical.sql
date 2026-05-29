-- ============================================================
-- SIR V2 — Migration 0010: observations + person_synthesis + canonical cols
-- ============================================================
-- Foundation para el detail page V2 (port de SIR V1).
--
-- Tres bloques:
--   1. Tabla NUEVA `observations` — immutable log de capturas (whatsapp_chat,
--      whatsapp_info, instagram, linkedin, manual_note, voice_note, unknown).
--      Cada captura se guarda como UN row inmutable; nunca se sobreescribe
--      (DF1). Reemplazos via `is_obsolete=true` + nuevo row.
--   2. Tabla NUEVA `person_synthesis` — cache de la sintesis narrativa
--      "Lo personal" (DF5). Versiones historicas con is_current flag.
--   3. ALTER `people` (9 columnas nuevas canonicas) + ALTER `memories`
--      (4 cols + 'social' agregado a type enum + 2 indexes).
--
-- Aplicar manualmente: Supabase Dashboard -> SQL Editor -> Run.
-- Riesgo BAJO: solo ADD COLUMN nullable o con DEFAULT, sin renames ni drops
-- destructivos. Tiempo estimado: < 5 segundos.
-- ============================================================

-- ─── 1A. Tabla observations ─────────────────────────────────────────
create table if not exists public.observations (
  id                  text primary key default gen_random_uuid()::text,
  user_id             uuid not null references auth.users(id) on delete cascade,
  person_id           text references public.people(id) on delete cascade,
  capture_type        text not null check (capture_type in (
    'whatsapp_chat',
    'whatsapp_info',
    'instagram',
    'linkedin',
    'manual_note',
    'voice_note',
    'unknown'
  )),
  source_image_path   text,
  storage_bucket      text,
  data                jsonb not null default '{}'::jsonb,
  detector_data       jsonb,
  user_edits          jsonb,
  confidence          text check (confidence in ('high', 'medium', 'low')),
  needs_review        boolean not null default false,
  observed_at         timestamptz not null,
  captured_at         timestamptz not null default now(),
  is_obsolete         boolean not null default false,
  obsoleted_at        timestamptz,
  obsoleted_reason    text,
  created_at          timestamptz not null default now()
);

-- ─── 1B. Indexes observations ───────────────────────────────────────
create index if not exists idx_observations_user_person
  on public.observations(user_id, person_id)
  where person_id is not null;

create index if not exists idx_observations_user_capture_type
  on public.observations(user_id, capture_type);

create index if not exists idx_observations_user_observed_at
  on public.observations(user_id, observed_at desc);

create index if not exists idx_observations_needs_review
  on public.observations(user_id, needs_review)
  where needs_review = true;

-- ─── 1C. RLS observations ───────────────────────────────────────────
alter table public.observations enable row level security;

drop policy if exists "select own observations" on public.observations;
create policy "select own observations"
  on public.observations for select
  using (auth.uid() = user_id);

drop policy if exists "insert own observations" on public.observations;
create policy "insert own observations"
  on public.observations for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own observations" on public.observations;
create policy "update own observations"
  on public.observations for update
  using (auth.uid() = user_id);

drop policy if exists "delete own observations" on public.observations;
create policy "delete own observations"
  on public.observations for delete
  using (auth.uid() = user_id);

-- ─── 2A. Tabla person_synthesis ─────────────────────────────────────
create table if not exists public.person_synthesis (
  id                          uuid primary key default uuid_generate_v4(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  person_id                   text not null references public.people(id) on delete cascade,
  synthesis_text              text not null,
  source_observation_count    int not null,
  source_observation_ids      text[] not null default '{}',
  model_used                  text not null,
  input_tokens                int,
  output_tokens               int,
  generated_at                timestamptz not null default now(),
  is_current                  boolean not null default true,
  generated_reason            text
);

-- ─── 2B. Indexes person_synthesis ───────────────────────────────────
create index if not exists idx_person_synthesis_current
  on public.person_synthesis(user_id, person_id)
  where is_current = true;

create index if not exists idx_person_synthesis_person
  on public.person_synthesis(user_id, person_id, generated_at desc);

-- ─── 2C. RLS person_synthesis ───────────────────────────────────────
alter table public.person_synthesis enable row level security;

drop policy if exists "select own person_synthesis" on public.person_synthesis;
create policy "select own person_synthesis"
  on public.person_synthesis for select
  using (auth.uid() = user_id);

drop policy if exists "insert own person_synthesis" on public.person_synthesis;
create policy "insert own person_synthesis"
  on public.person_synthesis for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own person_synthesis" on public.person_synthesis;
create policy "update own person_synthesis"
  on public.person_synthesis for update
  using (auth.uid() = user_id);

drop policy if exists "delete own person_synthesis" on public.person_synthesis;
create policy "delete own person_synthesis"
  on public.person_synthesis for delete
  using (auth.uid() = user_id);

-- ─── 3A. ALTER people (9 columnas canonicas) ────────────────────────
alter table public.people add column if not exists birth_date          date;
alter table public.people add column if not exists cycle_start_date    date;
alter table public.people add column if not exists cycle_length_days   int default 28
  check (cycle_length_days is null or cycle_length_days between 15 and 60);
alter table public.people add column if not exists phone_number        text;
alter table public.people add column if not exists linkedin_url        text;
alter table public.people add column if not exists instagram_handle    text;
alter table public.people add column if not exists twitter_handle      text;
alter table public.people add column if not exists special_dates       jsonb not null default '[]'::jsonb;
alter table public.people add column if not exists profile_avatar_path text;

-- ─── 3B. ALTER memories (4 columnas + 'social' type) ────────────────
alter table public.memories add column if not exists person_id      text references public.people(id) on delete cascade;
alter table public.memories add column if not exists source         text;
alter table public.memories add column if not exists quality_score  int
  check (quality_score is null or quality_score between 1 and 5);
alter table public.memories add column if not exists observation_id text references public.observations(id) on delete set null;

-- Extender type enum con 'social' (parity V1 + claridad semantica vs 'relational').
alter table public.memories drop constraint if exists memories_type_check;
alter table public.memories add constraint memories_type_check check (type in (
  'episodic', 'semantic', 'emotional', 'relational', 'temporal', 'predictive', 'social'
));

-- ─── 3C. Indexes memories nuevos ────────────────────────────────────
create index if not exists idx_memories_user_person
  on public.memories(user_id, person_id)
  where person_id is not null;

create index if not exists idx_memories_observation
  on public.memories(observation_id)
  where observation_id is not null;

-- ============================================================
-- Verificacion post-aplicacion (pegar en SQL Editor):
-- ============================================================
-- -- 1. tablas creadas:
-- select table_name from information_schema.tables
-- where table_schema = 'public' and table_name in ('observations', 'person_synthesis');
--
-- -- 2. RLS habilitado en ambas (esperado: rowsecurity = true):
-- select tablename, rowsecurity from pg_tables
-- where schemaname = 'public' and tablename in ('observations', 'person_synthesis');
--
-- -- 3. policies activas (8 esperadas: 4 + 4):
-- select tablename, policyname from pg_policies
-- where schemaname = 'public' and tablename in ('observations', 'person_synthesis')
-- order by tablename, policyname;
--
-- -- 4. columnas nuevas en people (9 esperadas):
-- select column_name, data_type, is_nullable from information_schema.columns
-- where table_name = 'people'
--   and column_name in ('birth_date','cycle_start_date','cycle_length_days',
--                       'phone_number','linkedin_url','instagram_handle',
--                       'twitter_handle','special_dates','profile_avatar_path')
-- order by column_name;
--
-- -- 5. columnas nuevas en memories (4 esperadas):
-- select column_name, data_type from information_schema.columns
-- where table_name = 'memories'
--   and column_name in ('person_id','source','quality_score','observation_id')
-- order by column_name;
--
-- -- 6. constraint memories_type_check incluye 'social':
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'memories_type_check';
--
-- -- 7. indexes nuevos:
-- select indexname from pg_indexes
-- where schemaname = 'public'
--   and indexname like 'idx_observations_%' or indexname like 'idx_person_synthesis_%'
--    or indexname in ('idx_memories_user_person', 'idx_memories_observation')
-- order by indexname;
