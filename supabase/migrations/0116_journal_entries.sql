-- ============================================================
-- SIR V2 — Migration 0116: journal_entries (journal íntimo /diario)
-- ============================================================
-- Aaron pidió (03-jul-2026): un espacio para escribir cosas SOBRE SÍ MISMO
-- que no están ancladas a una persona/objetivo/moment. Journaling íntimo
-- tipo Day One — texto libre fechado.
--
-- Filosofía: fricción cero. Escribí lo que quieras cuando quieras. SIR se
-- encarga de linkear automáticamente si mencionás una persona conocida
-- (mentioned_person_ids), pero no obliga a estructurar.
-- ============================================================

create table if not exists public.journal_entries (
  id                    text primary key default gen_random_uuid()::text,
  user_id               text not null,
  content               text not null,
  -- Estado emocional opcional (1-5). null = no lo dijo.
  mood                  smallint check (mood is null or (mood between 1 and 5)),
  -- Tags libres (#reflexión, #ansiedad, #trabajo…). Array de text.
  tags                  text[] not null default '{}',
  -- IDs de personas/objetivos mencionados (autodetección + edición manual).
  mentioned_person_ids  text[] not null default '{}',
  mentioned_goal_ids    text[] not null default '{}',
  -- Cuándo se escribió (default now, pero se puede backdate).
  entry_date            timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists journal_entries_by_user_date
  on public.journal_entries (user_id, entry_date desc);

-- GIN para búsqueda por tags y mentioned.
create index if not exists journal_entries_tags_gin
  on public.journal_entries using gin (tags);
create index if not exists journal_entries_mentioned_persons_gin
  on public.journal_entries using gin (mentioned_person_ids);

-- Full-text search para el content (español, sin acentos).
create index if not exists journal_entries_content_fts
  on public.journal_entries using gin (to_tsvector('spanish', content));

-- ─── RLS ────────────────────────────────────────────────────────────
alter table public.journal_entries enable row level security;

drop policy if exists "select own journal_entries" on public.journal_entries;
create policy "select own journal_entries"
  on public.journal_entries for select
  using (auth.uid()::text = user_id);

drop policy if exists "insert own journal_entries" on public.journal_entries;
create policy "insert own journal_entries"
  on public.journal_entries for insert
  with check (auth.uid()::text = user_id);

drop policy if exists "update own journal_entries" on public.journal_entries;
create policy "update own journal_entries"
  on public.journal_entries for update
  using (auth.uid()::text = user_id)
  with check (auth.uid()::text = user_id);

drop policy if exists "delete own journal_entries" on public.journal_entries;
create policy "delete own journal_entries"
  on public.journal_entries for delete
  using (auth.uid()::text = user_id);
